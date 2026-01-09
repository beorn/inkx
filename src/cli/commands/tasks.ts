/**
 * Task Command Group
 *
 * All task-related commands grouped under 'km task'
 */

import { Command } from "commander";
import chalk from "chalk";
import { ulid } from "ulid";
import { emitNodeCreated, emitNodeUpdated } from "../../node/emit.ts";
import {
  getNodeByPath,
  getAncestors,
  getDb,
} from "../../node/db.ts";
import { parseTaskMetadata, extractTags } from "../../md/parser.ts";
import type { Node, TaskStatus } from "../../node/types.ts";
import {
  getNodeDisplayName as getNodeDisplayNameBase,
  normalizeName,
  collapseAncestorsWithTypes,
  type CollapsedAncestor,
} from "../../shared/tree.ts";

/**
 * Format a collapsed ancestor for display with its type suffix
 */
function formatCollapsedAncestor(ca: CollapsedAncestor): string {
  const name = getNodeDisplayNameBase(ca.node);
  if (ca.typeSuffix) {
    return name + chalk.gray(` ${ca.typeSuffix}`);
  }
  // No collapsed suffix - show individual type indicator
  if (ca.node.type === "folder") {
    return name + chalk.gray("/");
  } else if (ca.node.type === "file") {
    return name + chalk.gray(".md");
  } else if (ca.node.type === "section") {
    const depth = (ca.node.data?.depth as number) ?? 1;
    return chalk.gray("#".repeat(depth) + " ") + name;
  }
  return name;
}

/**
 * Format a task for display with path
 */
function formatTaskWithPath(
  task: Node,
  collapsedAncestors: CollapsedAncestor[],
  options: { verbose?: boolean; flat?: boolean; showId?: boolean } = {}
): string[] {
  const lines: string[] = [];

  if (options.flat) {
    // Single line: path → task
    const pathParts = collapsedAncestors.map((ca) => chalk.dim(formatCollapsedAncestor(ca)));
    const pathStr = pathParts.length > 0 ? pathParts.join(" › ") + " › " : "";
    lines.push(pathStr + formatTaskLine(task, options));
  } else {
    // Multi-line: each ancestor on its own line
    // - Folders/files: 1 space per level
    // - Sections: same indent as their file (# prefix shows heading level)
    let fsDepth = 0;
    let hasSection = false;
    for (const ca of collapsedAncestors) {
      const prefix = " ".repeat(fsDepth);
      lines.push(prefix + chalk.dim(formatCollapsedAncestor(ca)));
      if (ca.node.type === "section") {
        hasSection = true;
      } else {
        // Only folders/files increase the depth
        fsDepth++;
      }
    }
    // Task indent: fsDepth + 3 spaces if under a section (to align with section content)
    const taskIndent = hasSection ? fsDepth + 3 : fsDepth;
    const taskPrefix = " ".repeat(taskIndent);
    lines.push(taskPrefix + formatTaskLine(task, options));
  }

  return lines;
}

/**
 * Format the task line itself (checkbox, id, content)
 */
function formatTaskLine(task: Node, options: { verbose?: boolean; showId?: boolean } = {}): string {
  const mark = task.task_mark ?? " ";
  const status = task.task_status ?? "open";

  // Color the checkbox based on status, using actual task mark
  const checkboxStr = `[${mark}]`;
  const checkbox =
    status === "done"
      ? chalk.green(checkboxStr)
      : status === "in_progress"
        ? chalk.yellow(checkboxStr)
        : status === "blocked"
          ? chalk.red(checkboxStr)
          : chalk.dim(checkboxStr);

  const content = task.content ?? "(no content)";

  // Build line: checkbox, optional id, content
  let line = `${checkbox} `;
  if (options.showId) {
    // Show last 8 chars of ID (the random part, not timestamp)
    const shortId = task.id.slice(-8);
    line += `${chalk.dim(shortId)}  `;
  }
  line += content;

  if (options.verbose) {
    if (task.due_date) {
      line += chalk.cyan(` 📅 ${task.due_date}`);
    }
    if (task.priority) {
      const p = task.priority === 1 ? "⏫" : task.priority === 2 ? "🔼" : "🔽";
      line += ` ${p}`;
    }
    if (task.assigned_to) {
      line += chalk.magenta(` @${task.assigned_to}`);
    }
  }

  return line;
}

/**
 * Find a node by path or ID prefix
 * Returns the node if found, null otherwise
 */
function findNodeByPathOrId(pathOrId: string): Node | null {
  const db = getDb();

  // Try exact ID match first
  let node = db
    .prepare("SELECT * FROM nodes WHERE id = ?")
    .get(pathOrId) as Node | undefined;
  if (node) return node;

  // Try ID prefix match
  node = db
    .prepare("SELECT * FROM nodes WHERE id LIKE ?")
    .get(`${pathOrId}%`) as Node | undefined;
  if (node) return node;

  // Try path match (exact)
  node = getNodeByPath(pathOrId);
  if (node) return node;

  // Try path match with vault path prefix (user may provide relative path)
  // Check if it looks like a relative path
  if (!pathOrId.startsWith("/")) {
    const cwd = process.cwd();
    const fullPath = `${cwd}/${pathOrId}`;
    node = getNodeByPath(fullPath);
    if (node) return node;
  }

  return null;
}

/**
 * Get all tasks under a root node (recursive)
 */
function getTasksUnderNode(rootId: string): Node[] {
  const db = getDb();

  // Use recursive CTE to get all descendants
  const sql = `
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM nodes WHERE parent_id = ?
      UNION ALL
      SELECT n.id FROM nodes n
      JOIN descendants d ON n.parent_id = d.id
    )
    SELECT * FROM nodes
    WHERE id IN descendants AND type = 'task'
    ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC
  `;

  return db.prepare(sql).all(rootId) as Node[];
}

/**
 * Task command - unified task management
 */
export const taskCommand = new Command("task")
  .description("Task management - list, add, complete, and assign tasks")
  .argument("[path-or-id]", "Path or ID to scope tasks (optional)")
  .option("-a, --all", "Show all tasks including done")
  .option("-s, --status <status>", "Filter by status (open, in_progress, done, blocked)")
  .option("-v, --verbose", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --id", "Show task IDs")
  .option("--json", "Output as JSON")
  .option("--add <content>", "Add a new task")
  .option("--done [id]", "Mark task as done (use with path-or-id or provide task id)")
  .option("--assign <user>", "Assign task to user (use with path-or-id)")
  .option("--claim", "Claim task for yourself (use with path-or-id)")
  .option("--release", "Release claimed task (use with path-or-id)")
  .action((pathOrId, options) => {
    // Handle mutation operations first
    if (options.add) {
      addTask(pathOrId, options.add, options);
      return;
    }

    if (options.done !== undefined) {
      // --done can be used with path-or-id or standalone with value
      const taskId = options.done === true ? pathOrId : options.done;
      markDone(taskId, options);
      return;
    }

    if (options.claim) {
      claimTask(pathOrId, options);
      return;
    }

    if (options.release) {
      releaseTask(pathOrId, options);
      return;
    }

    if (options.assign) {
      assignTask(pathOrId, options.assign, options);
      return;
    }

    // Default: list tasks
    listTasks(pathOrId, options);
  });

/**
 * Status subcommand - view or set task status
 *
 * km task status <id>              # View status
 * km task status <id> done         # Set status to done
 * km task status <id> open         # Set status to open
 * km task status <id> in_progress  # Set status to in_progress
 */
taskCommand
  .command("status")
  .description("View or set task status")
  .argument("<id>", "Task ID or prefix")
  .argument("[new-status]", "New status (open, in_progress, done, blocked, cancelled)")
  .option("--json", "Output as JSON")
  .action((id, newStatus, options) => {
    const task = findTask(id);

    if (!task) {
      console.error(chalk.red(`No task found with ID prefix: ${id}`));
      process.exit(1);
    }

    if (!newStatus) {
      // View mode - just show current status
      if (options.json) {
        console.log(JSON.stringify({
          id: task.id,
          status: task.task_status ?? "open",
          mark: task.task_mark ?? " ",
          content: task.content,
        }));
        return;
      }

      const status = task.task_status ?? "open";
      const statusIcon = status === "done"
        ? chalk.green("✓")
        : status === "in_progress"
          ? chalk.yellow("●")
          : status === "blocked"
            ? chalk.red("✗")
            : chalk.dim("○");

      console.log(`${statusIcon} ${status}: ${task.content?.slice(0, 60) ?? "(no content)"}`);
      return;
    }

    // Set mode - update the status
    const validStatuses = ["open", "in_progress", "done", "blocked", "waiting", "cancelled"];
    if (!validStatuses.includes(newStatus)) {
      console.error(chalk.red(`Invalid status: ${newStatus}`));
      console.error(chalk.dim(`Valid statuses: ${validStatuses.join(", ")}`));
      process.exit(1);
    }

    const newMark = getMarkForStatus(newStatus as TaskStatus);

    emitNodeUpdated("cli", task.id, {
      task_status: newStatus as TaskStatus,
      task_mark: newMark,
    });

    if (options.json) {
      console.log(JSON.stringify({ id: task.id, status: newStatus }));
      return;
    }

    const statusIcon = newStatus === "done"
      ? chalk.green("✓")
      : newStatus === "in_progress"
        ? chalk.yellow("●")
        : newStatus === "blocked"
          ? chalk.red("✗")
          : chalk.dim("○");

    console.log(
      `${statusIcon} ${chalk.dim(task.id.slice(0, 8))} → ${newStatus}: ${task.content?.slice(0, 50) ?? "(no content)"}`
    );
  });

/**
 * Get task mark for status
 */
function getMarkForStatus(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "x";
    case "in_progress":
      return "/";
    case "blocked":
      return "-";
    case "waiting":
      return "?";
    case "cancelled":
      return "-";
    default:
      return " ";
  }
}

/**
 * Build a tree structure for tasks grouped by their ancestor paths
 */
interface TaskWithAncestors {
  task: Node;
  collapsedAncestors: CollapsedAncestor[];  // Collapsed with type suffixes
  ancestorKeys: string[];                    // For sorting/grouping by normalized name
}

/**
 * Get a stable key for a collapsed ancestor (for grouping)
 * Uses normalized name so similar names group together
 */
function getAncestorKey(ca: CollapsedAncestor): string {
  return normalizeName(getNodeDisplayNameBase(ca.node));
}

function buildTaskTree(tasks: Node[]): TaskWithAncestors[] {
  return tasks.map((task) => {
    const rawAncestors = getAncestors(task.id);
    const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors);
    return {
      task,
      collapsedAncestors,
      ancestorKeys: collapsedAncestors.map((ca) => getAncestorKey(ca)),
    };
  });
}

/**
 * Sort tasks so those with shared paths are adjacent
 */
function sortByPath(tasksWithAncestors: TaskWithAncestors[]): TaskWithAncestors[] {
  return tasksWithAncestors.sort((a, b) => {
    // Compare ancestor paths by keys (fs_path/slug/content), not IDs
    const minLen = Math.min(a.ancestorKeys.length, b.ancestorKeys.length);
    for (let i = 0; i < minLen; i++) {
      if (a.ancestorKeys[i] < b.ancestorKeys[i]) return -1;
      if (a.ancestorKeys[i] > b.ancestorKeys[i]) return 1;
    }
    // Shorter paths come first
    return a.ancestorKeys.length - b.ancestorKeys.length;
  });
}

/**
 * Check if a segment (folder name, filename, section title) matches the filter
 * Default: segment starts with filter (case-insensitive)
 * With *filter*: contains filter anywhere
 */
function segmentMatches(segment: string, filter: string, mode: "prefix" | "contains"): boolean {
  const segmentLower = segment.toLowerCase();
  const filterLower = filter.toLowerCase();

  if (mode === "contains") {
    return segmentLower.includes(filterLower);
  }
  // prefix mode: segment starts with filter
  return segmentLower.startsWith(filterLower);
}

/**
 * Get the "name" part of a node for matching purposes
 * - For folders/files: the last path segment (basename)
 * - For sections: the content (heading text)
 * - For tasks: the content
 */
function getNodeSegmentName(node: Node): string | null {
  if (node.fs_path) {
    // Get basename from path
    return node.fs_path.split("/").pop() ?? null;
  }
  if (node.content) {
    return node.content;
  }
  if (node.md_slug) {
    return node.md_slug;
  }
  return null;
}

/**
 * Check if a task's path matches the filter
 *
 * Matching modes:
 * - "projects"    -> matches path segments that START with "projects" (default)
 * - "*projects*"  -> matches path segments that CONTAIN "projects" (explicit contains)
 */
function taskPathMatches(task: Node, filter: string): boolean {
  // Determine matching mode based on filter syntax
  let mode: "prefix" | "contains" = "prefix";
  let cleanFilter = filter;

  if (filter.startsWith("*") && filter.endsWith("*") && filter.length > 2) {
    // *foo* means contains
    mode = "contains";
    cleanFilter = filter.slice(1, -1);
  } else if (filter.includes("*")) {
    // Has wildcard but not wrapped - treat as contains for flexibility
    mode = "contains";
    cleanFilter = filter.replace(/\*/g, "");
  }

  // Check task content
  const taskName = getNodeSegmentName(task);
  if (taskName && segmentMatches(taskName, cleanFilter, mode)) {
    return true;
  }

  // Check ancestors for path match
  const ancestors = getAncestors(task.id);
  for (const ancestor of ancestors) {
    const ancestorName = getNodeSegmentName(ancestor);
    if (ancestorName && segmentMatches(ancestorName, cleanFilter, mode)) {
      return true;
    }
  }

  return false;
}

/**
 * List tasks (optionally scoped to a root node or filtered by path)
 */
function listTasks(
  pathOrId: string | undefined,
  options: {
    status?: string;
    all?: boolean;
    verbose?: boolean;
    flat?: boolean;
    id?: boolean;
    json?: boolean;
  }
): void {
  const db = getDb();
  let tasks: Node[];
  let rootNode: Node | null = null;
  let pathFilter: string | null = null;

  if (pathOrId) {
    // Try to find an exact node match first
    rootNode = findNodeByPathOrId(pathOrId);

    if (rootNode) {
      // If the root IS a task, show its details
      if (rootNode.type === "task") {
        showTaskDetails(rootNode, options);
        return;
      }

      // Get tasks under this root
      tasks = getTasksUnderNode(rootNode.id);
    } else {
      // No exact match - treat as path filter (like `bun test <filter>`)
      pathFilter = pathOrId;

      // Get all tasks and filter by path
      let sql = "SELECT * FROM nodes WHERE type = 'task'";
      const params: unknown[] = [];

      if (options.status) {
        sql += " AND task_status = ?";
        params.push(options.status);
      } else if (!options.all) {
        sql += " AND task_status IN ('open', 'in_progress')";
      }

      sql += " ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC";
      const allTasks = db.prepare(sql).all(...params) as Node[];

      // Filter by path match
      tasks = allTasks.filter((t) => taskPathMatches(t, pathFilter!));
    }

    // Apply status filter for root node case
    if (rootNode) {
      if (options.status) {
        tasks = tasks.filter((t) => t.task_status === options.status);
      } else if (!options.all) {
        tasks = tasks.filter(
          (t) => t.task_status === "open" || t.task_status === "in_progress"
        );
      }
    }
  } else {
    // Global task list
    let sql = "SELECT * FROM nodes WHERE type = 'task'";
    const params: unknown[] = [];

    if (options.status) {
      sql += " AND task_status = ?";
      params.push(options.status);
    } else if (!options.all) {
      sql += " AND task_status IN ('open', 'in_progress')";
    }

    sql +=
      " ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC";
    tasks = db.prepare(sql).all(...params) as Node[];
  }

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  if (tasks.length === 0) {
    console.log(chalk.dim("No tasks found"));
    return;
  }

  // Show context header
  if (rootNode) {
    console.log(chalk.bold(getNodeDisplayNameBase(rootNode)));
    console.log();
  } else if (pathFilter) {
    console.log(chalk.dim(`Filter: ${pathFilter}`));
    console.log();
  }

  // Flat mode: simple single-line display
  if (options.flat) {
    for (const task of tasks) {
      const rawAncestors = getAncestors(task.id);
      const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors);
      const lines = formatTaskWithPath(task, collapsedAncestors, {
        verbose: options.verbose,
        flat: true,
        showId: options.id,
      });
      for (const line of lines) {
        console.log(line);
      }
    }
    console.log();
    console.log(chalk.dim(`${tasks.length} task(s)`));
    return;
  }

  // Tree mode: group tasks by shared paths
  const tasksWithAncestors = buildTaskTree(tasks);
  const sorted = sortByPath(tasksWithAncestors);

  let previousAncestorKeys: string[] = [];

  for (const { task, collapsedAncestors, ancestorKeys } of sorted) {
    // Find where current path diverges from previous
    let divergeIndex = 0;
    while (
      divergeIndex < previousAncestorKeys.length &&
      divergeIndex < ancestorKeys.length &&
      previousAncestorKeys[divergeIndex] === ancestorKeys[divergeIndex]
    ) {
      divergeIndex++;
    }

    // Count fs depth (folders/files) before divergence point
    let fsDepth = 0;
    for (let i = 0; i < divergeIndex && i < collapsedAncestors.length; i++) {
      if (collapsedAncestors[i]!.node.type !== "section") {
        fsDepth++;
      }
    }

    // Print only the new path elements with appropriate indentation
    // - Folders/files: 1 space per level
    // - Sections: same indent as their file (# prefix shows heading level)
    let hasSection = false;
    for (let i = divergeIndex; i < collapsedAncestors.length; i++) {
      const ca = collapsedAncestors[i]!;
      const prefix = " ".repeat(fsDepth);
      console.log(prefix + chalk.dim(formatCollapsedAncestor(ca)));
      if (ca.node.type === "section") {
        hasSection = true;
      } else {
        // Only folders/files increase the depth
        fsDepth++;
      }
    }

    // Check if any ancestor was a section (for task indent)
    if (!hasSection) {
      hasSection = collapsedAncestors.some((ca) => ca.node.type === "section");
    }

    // Task indent: fsDepth + 3 spaces if under a section (to align with section content)
    const taskIndent = hasSection ? fsDepth + 3 : fsDepth;
    const taskPrefix = " ".repeat(taskIndent);
    console.log(
      taskPrefix +
        formatTaskLine(task, { verbose: options.verbose, showId: options.id })
    );

    previousAncestorKeys = ancestorKeys;
  }

  console.log();
  console.log(chalk.dim(`${tasks.length} task(s)`));
}

/**
 * Show task details
 */
function showTaskDetails(
  task: Node,
  options: { json?: boolean }
): void {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  console.log(chalk.bold("Task:"), task.id);
  console.log(chalk.dim("Status:"), task.task_status ?? "open");
  console.log(chalk.dim("Content:"), task.content ?? "(none)");
  if (task.due_date) console.log(chalk.dim("Due:"), task.due_date);
  if (task.scheduled_date)
    console.log(chalk.dim("Scheduled:"), task.scheduled_date);
  if (task.priority) console.log(chalk.dim("Priority:"), task.priority);
  if (task.assigned_to) console.log(chalk.dim("Assigned:"), task.assigned_to);
  if (task.parent_id)
    console.log(chalk.dim("Parent:"), task.parent_id.slice(0, 8));
  console.log(chalk.dim("Created:"), new Date(task.created_at!).toISOString());

  // Show child tasks if any
  const children = getTasksUnderNode(task.id);
  if (children.length > 0) {
    console.log();
    console.log(chalk.dim(`${children.length} subtask(s):`));
    for (const child of children) {
      console.log("  " + formatTaskLine(child, { showId: true }));
    }
  }
}

/**
 * Add a task under a parent
 */
function addTask(
  pathOrId: string | undefined,
  content: string,
  options: { json?: boolean }
): void {
  // Parse metadata from content
  const metadata = parseTaskMetadata(content);
  const tags = extractTags(content);

  // Resolve parent
  let parentId: string | null = null;
  if (pathOrId) {
    const parent = findNodeByPathOrId(pathOrId);
    if (!parent) {
      console.error(chalk.red(`Parent not found: ${pathOrId}`));
      process.exit(1);
    }
    parentId = parent.id;
  }

  const nodeId = ulid();
  const event = emitNodeCreated(process.env.USER ?? "user", {
    id: nodeId,
    type: "task",
    parent_id: parentId,
    content: content,
    task_status: "open" as TaskStatus,
    task_mark: " ",
    due_date: metadata.dueDate,
    scheduled_date: metadata.scheduledDate,
    priority: metadata.priority,
    data: tags.length > 0 ? { tags } : {},
  });

  if (options.json) {
    console.log(JSON.stringify({ id: nodeId, event: event.id }));
    return;
  }

  console.log(chalk.green("Created task:"), nodeId.slice(0, 8));
}

/**
 * Mark a task as done
 */
function markDone(
  pathOrId: string | undefined,
  options: { json?: boolean }
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = findTask(pathOrId);
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`));
    process.exit(1);
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    task_status: "done",
    task_mark: "x",
  });

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "done" }));
    return;
  }

  console.log(chalk.green("✓"), "Marked as done:", task.id.slice(0, 8));
}

/**
 * Claim a task (assign to yourself)
 */
function claimTask(
  pathOrId: string | undefined,
  options: { json?: boolean }
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = findTask(pathOrId);
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`));
    process.exit(1);
  }

  const actor = process.env.USER ?? "user";
  emitNodeUpdated(actor, task.id, {
    assigned_to: actor,
    task_status: "in_progress",
    task_mark: "/",
  });

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "in_progress", assigned_to: actor }));
    return;
  }

  console.log(chalk.green("◐"), "Claimed:", task.id.slice(0, 8));
}

/**
 * Release a claimed task
 */
function releaseTask(
  pathOrId: string | undefined,
  options: { json?: boolean }
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = findTask(pathOrId);
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`));
    process.exit(1);
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    assigned_to: null,
    task_status: "open" as TaskStatus,
    task_mark: " ",
  });

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "open", assigned_to: null }));
    return;
  }

  console.log(chalk.dim("○"), "Released:", task.id.slice(0, 8));
}

/**
 * Assign a task to a user
 */
function assignTask(
  pathOrId: string | undefined,
  user: string,
  options: { json?: boolean }
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = findTask(pathOrId);
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`));
    process.exit(1);
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    assigned_to: user,
  });

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, assigned_to: user }));
    return;
  }

  console.log(chalk.green("→"), `Assigned to ${user}:`, task.id.slice(0, 8));
}

/**
 * Find a task by ID prefix
 */
function findTask(idPrefix: string): Node | null {
  const db = getDb();

  // Try exact match first
  let task = db
    .prepare("SELECT * FROM nodes WHERE id = ? AND type = 'task'")
    .get(idPrefix) as Node | undefined;

  if (task) return task;

  // Try prefix match
  task = db
    .prepare("SELECT * FROM nodes WHERE id LIKE ? AND type = 'task'")
    .get(`${idPrefix}%`) as Node | undefined;

  return task ?? null;
}

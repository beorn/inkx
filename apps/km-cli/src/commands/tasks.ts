/**
 * Task Command Group
 *
 * All task-related commands grouped under 'km task'
 */

import { Command } from "commander";
import chalk from "chalk";
import { ulid } from "ulid";
import {
  emitNodeCreated,
  emitNodeUpdated,
  getNodeByPath,
  getAncestors,
  getDb,
  queryTasks,
  getTaskByIdPrefix,
  getNodeByIdPrefix,
  parseTaskMetadata,
  extractTags,
  getChildren,
} from "@km/storage";
import type { KNode, TaskStatus } from "@km/core";
import {
  getNodeDisplayName as getNodeDisplayNameRaw,
  normalizeName,
  collapseAncestorsWithTypes,
  type CollapsedAncestor,
} from "@km/tree";

// Bound version with store dependency
const getNodeDisplayNameBase = (
  node: Parameters<typeof getNodeDisplayNameRaw>[0],
) => getNodeDisplayNameRaw(node, getChildren);

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
    // Only add .md if name doesn't already end with it
    return name.endsWith(".md") ? name : name + chalk.gray(".md");
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
  options: { verbose?: boolean; flat?: boolean; showId?: boolean } = {},
): string[] {
  const lines: string[] = [];

  if (options.flat) {
    // Single line: path → task
    const pathParts = collapsedAncestors.map((ca) =>
      chalk.dim(formatCollapsedAncestor(ca)),
    );
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
function formatTaskLine(
  task: Node,
  options: { verbose?: boolean; showId?: boolean } = {},
): string {
  const mark = task.task_mark ?? " ";
  const status = task.task_status ?? "todo";

  // Color the checkbox based on status, using actual task mark
  const checkboxStr = `[${mark}]`;
  const checkbox =
    status === "done"
      ? chalk.green(checkboxStr)
      : status === "wip"
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
 * Find a node by path or ID prefix/suffix
 * Returns the node if found, null otherwise
 */
function findNodeByPathOrId(pathOrId: string): KNode | null {
  // Try ID match (exact, prefix, or suffix)
  const node = getNodeByIdPrefix(pathOrId);
  if (node) return node;

  // Try path match (exact)
  const byPath = getNodeByPath(pathOrId);
  if (byPath) return byPath;

  // Try path match with vault path prefix (user may provide relative path)
  // Check if it looks like a relative path
  if (!pathOrId.startsWith("/")) {
    const cwd = process.cwd();
    const fullPath = `${cwd}/${pathOrId}`;
    const byFullPath = getNodeByPath(fullPath);
    if (byFullPath) return byFullPath;
  }

  return null;
}

/**
 * Get all tasks under a root node (recursive)
 */
function getTasksUnderNode(rootId: string): KNode[] {
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
export const taskCommand = new Command("tasks")
  .description("Task management - list, add, complete, and assign tasks")
  .argument(
    "[query...]",
    "Query terms: @person, #tag, +project, status:todo, ./path/**",
  )
  .option("-a, --all", "Show all tasks including done")
  .option(
    "-s, --status <status>",
    "Filter by status (todo, wip, done, blocked)",
  )
  .option(
    "-q, --query <query>",
    "Filter with query syntax (status:todo @person #tag)",
  )
  .option("-v, --verbose", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --id", "Show task IDs")
  .option("--json", "Output as JSON")
  .option("--add <content>", "Add a new task")
  .option(
    "--done [id]",
    "Mark task as done (use with path-or-id or provide task id)",
  )
  .option("--assign <user>", "Assign task to user (use with path-or-id)")
  .option("--claim", "Claim task for yourself (use with path-or-id)")
  .option("--release", "Release claimed task (use with path-or-id)")
  .action((queryArgs: string[], options) => {
    // Join query args into a single query string (or use first arg for ID-based operations)
    const queryStr = queryArgs.length > 0 ? queryArgs.join(" ") : undefined;
    const firstArg = queryArgs[0];

    // Handle mutation operations first
    if (options.add) {
      addTask(firstArg, options.add, options);
      return;
    }

    if (options.done !== undefined) {
      // --done can be used with path-or-id or standalone with value
      const taskId = options.done === true ? firstArg : options.done;
      markDone(taskId, options);
      return;
    }

    if (options.claim) {
      claimTask(firstArg, options);
      return;
    }

    if (options.release) {
      releaseTask(firstArg, options);
      return;
    }

    if (options.assign) {
      assignTask(firstArg, options.assign, options);
      return;
    }

    // Default: list tasks
    listTasks(queryStr, options);
  });

/**
 * Status subcommand - view or set task status
 *
 * km task status <id>              # View status
 * km task status <id> done         # Set status to done
 * km task status <id> todo         # Set status to todo
 * km task status <id> wip          # Set status to wip
 */
taskCommand
  .command("status")
  .description("View or set task status")
  .argument("<id>", "Task ID or prefix")
  .argument("[new-status]", "New status (todo, wip, blocked, done, dropped)")
  .option("--json", "Output as JSON")
  .action((id, newStatus, options) => {
    const task = getTaskByIdPrefix(id);

    if (!task) {
      console.error(chalk.red(`No task found with ID prefix: ${id}`));
      process.exit(1);
    }

    if (!newStatus) {
      // View mode - just show current status
      if (options.json) {
        console.log(
          JSON.stringify({
            id: task.id,
            status: task.task_status ?? "todo",
            mark: task.task_mark ?? " ",
            content: task.content,
          }),
        );
        return;
      }

      const status = task.task_status ?? "todo";
      const statusIcon =
        status === "done"
          ? chalk.green("✓")
          : status === "wip"
            ? chalk.yellow("●")
            : status === "blocked"
              ? chalk.red("✗")
              : chalk.dim("○");

      console.log(
        `${statusIcon} ${status}: ${task.content?.slice(0, 60) ?? "(no content)"}`,
      );
      return;
    }

    // Set mode - update the status
    const validStatuses = ["todo", "wip", "blocked", "done", "dropped"];
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

    const statusIcon =
      newStatus === "done"
        ? chalk.green("✓")
        : newStatus === "wip"
          ? chalk.yellow("●")
          : newStatus === "blocked"
            ? chalk.red("✗")
            : chalk.dim("○");

    console.log(
      `${statusIcon} ${chalk.dim(task.id.slice(0, 8))} → ${newStatus}: ${task.content?.slice(0, 50) ?? "(no content)"}`,
    );
  });

/**
 * Get task mark for status
 */
function getMarkForStatus(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "x";
    case "wip":
      return "/";
    case "blocked":
      return "!";
    case "dropped":
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
  collapsedAncestors: CollapsedAncestor[]; // Collapsed with type suffixes
  ancestorKeys: string[]; // For sorting/grouping by normalized name
}

/**
 * Get a stable key for a collapsed ancestor (for grouping)
 * Uses normalized name so similar names group together
 */
function getAncestorKey(ca: CollapsedAncestor): string {
  return normalizeName(getNodeDisplayNameBase(ca.node));
}

function buildTaskTree(tasks: KNode[]): TaskWithAncestors[] {
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
function sortByPath(
  tasksWithAncestors: TaskWithAncestors[],
): TaskWithAncestors[] {
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
function segmentMatches(
  segment: string,
  filter: string,
  mode: "prefix" | "contains",
): boolean {
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
function getNodeSegmentName(node: KNode): string | null {
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
 * List tasks (optionally scoped to a root node or filtered by path/query)
 */
/**
 * Check if a string looks like a query (vs a path or ID)
 * Query indicators: starts with @, #, +, -, contains :, or is a known date shortcut
 */
function looksLikeQuery(str: string): boolean {
  // Reference filters
  if (/^[@#+-]/.test(str)) return true;
  // Field:value filters
  if (/[a-z]+:/.test(str)) return true;
  // Path patterns (these ARE queries, not just paths)
  if (/\*\*$/.test(str)) return true;
  // Quoted phrases
  if (/^".*"$/.test(str)) return true;
  return false;
}

function listTasks(
  pathOrId: string | undefined,
  options: {
    status?: string;
    query?: string;
    all?: boolean;
    verbose?: boolean;
    flat?: boolean;
    id?: boolean;
    json?: boolean;
  },
): void {
  const db = getDb();
  let tasks: KNode[];
  let rootNode: KNode | null = null;
  let pathFilter: string | null = null;

  // Handle query option first (takes precedence)
  // Also treat positional arg as query if it looks like one
  const queryArg =
    options.query || (pathOrId && looksLikeQuery(pathOrId) ? pathOrId : null);
  if (queryArg) {
    // Build query string, adding default status filter
    let queryStr = queryArg;
    if (!options.all && !queryStr.includes("status:")) {
      queryStr = `-status:done ${queryStr}`;
    }
    if (options.status) {
      queryStr = `status:${options.status} ${queryStr}`;
    }
    tasks = queryTasks(queryStr);
  } else if (pathOrId) {
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
        sql += " AND task_status IN ('todo', 'wip')";
      }

      sql +=
        " ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC";
      const allTasks = db.prepare(sql).all(...params) as Node[];

      // Filter by path match
      tasks = allTasks.filter(
        (t) => pathFilter && taskPathMatches(t, pathFilter),
      );
    }

    // Apply status filter for root node case
    if (rootNode) {
      if (options.status) {
        tasks = tasks.filter((t) => t.task_status === options.status);
      } else if (!options.all) {
        tasks = tasks.filter(
          (t) => t.task_status === "todo" || t.task_status === "wip",
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
      sql += " AND task_status IN ('todo', 'wip')";
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
      const ca = collapsedAncestors[i];
      if (ca && ca.node.type !== "section") {
        fsDepth++;
      }
    }

    // Print only the new path elements with appropriate indentation
    // - Folders/files: 1 space per level
    // - Sections: same indent as their file (# prefix shows heading level)
    let hasSection = false;
    for (let i = divergeIndex; i < collapsedAncestors.length; i++) {
      const ca = collapsedAncestors[i];
      if (!ca) continue;
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
        formatTaskLine(task, { verbose: options.verbose, showId: options.id }),
    );

    previousAncestorKeys = ancestorKeys;
  }

  console.log();
  console.log(chalk.dim(`${tasks.length} task(s)`));
}

/**
 * Show task details
 */
function showTaskDetails(task: Node, options: { json?: boolean }): void {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  console.log(chalk.bold("Task:"), task.id);
  console.log(chalk.dim("Status:"), task.task_status ?? "todo");
  console.log(chalk.dim("Content:"), task.content ?? "(none)");
  if (task.due_date) console.log(chalk.dim("Due:"), task.due_date);
  if (task.scheduled_date) {
    console.log(chalk.dim("Scheduled:"), task.scheduled_date);
  }
  if (task.priority) console.log(chalk.dim("Priority:"), task.priority);
  if (task.assigned_to) console.log(chalk.dim("Assigned:"), task.assigned_to);
  if (task.parent_id) {
    console.log(chalk.dim("Parent:"), task.parent_id.slice(0, 8));
  }
  console.log(
    chalk.dim("Created:"),
    new Date(task.created_at ?? Date.now()).toISOString(),
  );

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
  options: { json?: boolean },
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
    task_status: "todo" as TaskStatus,
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
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = getTaskByIdPrefix(pathOrId);
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
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = getTaskByIdPrefix(pathOrId);
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`));
    process.exit(1);
  }

  const actor = process.env.USER ?? "user";
  emitNodeUpdated(actor, task.id, {
    assigned_to: actor,
    task_status: "wip",
    task_mark: "/",
  });

  if (options.json) {
    console.log(
      JSON.stringify({
        id: task.id,
        status: "wip",
        assigned_to: actor,
      }),
    );
    return;
  }

  console.log(chalk.green("◐"), "Claimed:", task.id.slice(0, 8));
}

/**
 * Release a claimed task
 */
function releaseTask(
  pathOrId: string | undefined,
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = getTaskByIdPrefix(pathOrId);
  if (!task) {
    console.error(chalk.red(`Task not found: ${pathOrId}`));
    process.exit(1);
  }

  emitNodeUpdated(process.env.USER ?? "user", task.id, {
    assigned_to: null,
    task_status: "todo" as TaskStatus,
    task_mark: " ",
  });

  if (options.json) {
    console.log(
      JSON.stringify({ id: task.id, status: "todo", assigned_to: null }),
    );
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
  options: { json?: boolean },
): void {
  if (!pathOrId) {
    console.error(chalk.red("Task ID or path required"));
    process.exit(1);
  }

  const task = getTaskByIdPrefix(pathOrId);
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
 * Set subcommand - set task field values
 *
 * km task set <id> due:2025-01-20      # Set due date
 * km task set <id> p:1                 # Set priority
 * km task set <id> status:blocked      # Set blocked
 */
taskCommand
  .command("set")
  .description("Set task field values")
  .argument("<id>", "Task ID or prefix")
  .argument(
    "<fields...>",
    "Field:value pairs (due:2025-01-20, p:1, status:todo)",
  )
  .option("--json", "Output as JSON")
  .action((id, fields, options) => {
    const task = getTaskByIdPrefix(id);

    if (!task) {
      console.error(chalk.red(`No task found with ID prefix: ${id}`));
      process.exit(1);
    }

    const updates: Record<string, unknown> = {};

    for (const field of fields) {
      const colonIndex = field.indexOf(":");
      if (colonIndex === -1) {
        console.error(
          chalk.red(`Invalid field format: ${field} (expected field:value)`),
        );
        process.exit(1);
      }

      const key = field.slice(0, colonIndex).toLowerCase();
      const value = field.slice(colonIndex + 1);

      switch (key) {
        case "due":
        case "due_date":
          updates.due_date = value || null;
          break;
        case "start":
        case "scheduled":
        case "scheduled_date":
          updates.scheduled_date = value || null;
          break;
        case "p":
        case "priority":
          updates.priority = value ? parseInt(value, 10) : null;
          break;
        case "status":
        case "task_status":
          updates.task_status = value as TaskStatus;
          updates.task_mark = getMarkForStatus(value as TaskStatus);
          break;
        case "assigned":
        case "assigned_to":
        case "owner":
          updates.assigned_to = value || null;
          break;
        default:
          console.error(chalk.yellow(`Unknown field: ${key}`));
      }
    }

    if (Object.keys(updates).length === 0) {
      console.error(chalk.red("No valid field updates provided"));
      process.exit(1);
    }

    emitNodeUpdated(process.env.USER ?? "user", task.id, updates);

    if (options.json) {
      console.log(JSON.stringify({ id: task.id, updates }));
      return;
    }

    console.log(
      chalk.green("✓"),
      `Updated ${Object.keys(updates).join(", ")}:`,
      task.id.slice(0, 8),
    );
  });

/**
 * Clear subcommand - clear task field values
 *
 * km task clear <id> due        # Clear due date
 * km task clear <id> priority   # Clear priority
 */
taskCommand
  .command("clear")
  .description("Clear task field values")
  .argument("<id>", "Task ID or prefix")
  .argument(
    "<fields...>",
    "Fields to clear (due, priority, scheduled, assigned)",
  )
  .option("--json", "Output as JSON")
  .action((id, fields, options) => {
    const task = getTaskByIdPrefix(id);

    if (!task) {
      console.error(chalk.red(`No task found with ID prefix: ${id}`));
      process.exit(1);
    }

    const updates: Record<string, unknown> = {};

    for (const field of fields) {
      const key = field.toLowerCase();

      switch (key) {
        case "due":
        case "due_date":
          updates.due_date = null;
          break;
        case "start":
        case "scheduled":
        case "scheduled_date":
          updates.scheduled_date = null;
          break;
        case "p":
        case "priority":
          updates.priority = null;
          break;
        case "assigned":
        case "assigned_to":
        case "owner":
          updates.assigned_to = null;
          break;
        default:
          console.error(chalk.yellow(`Unknown field: ${key}`));
      }
    }

    if (Object.keys(updates).length === 0) {
      console.error(chalk.red("No valid fields to clear"));
      process.exit(1);
    }

    emitNodeUpdated(process.env.USER ?? "user", task.id, updates);

    if (options.json) {
      console.log(JSON.stringify({ id: task.id, cleared: fields }));
      return;
    }

    console.log(
      chalk.dim("○"),
      `Cleared ${fields.join(", ")}:`,
      task.id.slice(0, 8),
    );
  });

/**
 * Claim subcommand - assign task to yourself
 *
 * km task claim <id>
 */
taskCommand
  .command("claim")
  .description("Claim task (assign to yourself)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    claimTask(id, options);
  });

/**
 * Release subcommand - unassign task
 *
 * km task release <id>
 */
taskCommand
  .command("release")
  .description("Release task (unassign)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    releaseTask(id, options);
  });

/**
 * Tasks Command Group
 *
 * All task-related commands grouped under 'km tasks'
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

/**
 * Get display name for a node (title/content preferred, then filename, then slug)
 */
function getNodeDisplayName(node: Node, includeFolderSlash = false): string {
  let name: string;

  // Prefer content (title/heading text) if available
  if (node.content) {
    const preview = node.content.slice(0, 50);
    name = preview.length < node.content.length ? `${preview}...` : preview;
  } else if (node.fs_path) {
    // For files, use the filename
    const filename = node.fs_path.split("/").pop() ?? node.fs_path;
    // Remove .md extension
    name = filename.replace(/\.md$/, "");
  } else if (node.md_slug) {
    // Fallback to slug if no content
    name = node.md_slug;
  } else {
    // Fallback to type
    name = `(${node.type})`;
  }

  // Add faint / suffix for folders
  if (includeFolderSlash && node.type === "folder") {
    name += chalk.gray("/");
  }

  return name;
}

/**
 * Normalize a name for comparison (lowercase, remove special chars, collapse whitespace)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, " ")        // Treat - and _ as spaces
    .replace(/\.md$/i, "")        // Remove .md extension
    .replace(/[^\w\s]/g, "")      // Remove special chars
    .replace(/\s+/g, " ")         // Collapse whitespace
    .trim();
}

/**
 * Check if two names are substantially the same
 */
function namesAreSimilar(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/**
 * Filter ancestors to remove redundant levels (where name matches parent/child)
 */
function collapseRedundantAncestors(ancestors: Node[]): Node[] {
  if (ancestors.length === 0) return ancestors;

  const result: Node[] = [];

  for (let i = 0; i < ancestors.length; i++) {
    const current = ancestors[i];
    const currentName = getNodeDisplayName(current);

    // Skip if this name is the same as the previous kept item
    if (result.length > 0) {
      const prevName = getNodeDisplayName(result[result.length - 1]);
      if (namesAreSimilar(currentName, prevName)) {
        continue;
      }
    }

    // Skip if this name is the same as the next item
    if (i < ancestors.length - 1) {
      const nextName = getNodeDisplayName(ancestors[i + 1]);
      if (namesAreSimilar(currentName, nextName)) {
        continue;
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * Format a task for display with path
 */
function formatTaskWithPath(
  task: Node,
  ancestors: Node[],
  options: { verbose?: boolean; flat?: boolean; showId?: boolean } = {}
): string[] {
  const lines: string[] = [];
  const indent = "  ";

  if (options.flat) {
    // Single line: path → task
    const pathParts = ancestors.map((a) => chalk.dim(getNodeDisplayName(a, true)));
    const pathStr = pathParts.length > 0 ? pathParts.join(" › ") + " › " : "";
    lines.push(pathStr + formatTaskLine(task, options));
  } else {
    // Multi-line: each ancestor on its own line, indented
    for (let i = 0; i < ancestors.length; i++) {
      const ancestor = ancestors[i];
      const prefix = indent.repeat(i);
      lines.push(prefix + chalk.dim(getNodeDisplayName(ancestor, true)));
    }
    // Task at its depth
    const taskPrefix = indent.repeat(ancestors.length);
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
 * Tasks command - unified task management
 */
export const tasksCommand = new Command("tasks")
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
 * Build a tree structure for tasks grouped by their ancestor paths
 */
interface TaskWithAncestors {
  task: Node;
  ancestors: Node[];        // Collapsed (redundant levels removed)
  ancestorKeys: string[];   // For sorting/grouping by normalized name
}

/**
 * Get a stable key for an ancestor node (for grouping)
 * Uses normalized name so similar names group together
 */
function getAncestorKey(node: Node): string {
  return normalizeName(getNodeDisplayName(node));
}

function buildTaskTree(tasks: Node[]): TaskWithAncestors[] {
  return tasks.map((task) => {
    const rawAncestors = getAncestors(task.id);
    const ancestors = collapseRedundantAncestors(rawAncestors);
    return {
      task,
      ancestors,
      ancestorKeys: ancestors.map((a) => getAncestorKey(a)),
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
 * List tasks (optionally scoped to a root node)
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

  if (pathOrId) {
    // Find the root node
    rootNode = findNodeByPathOrId(pathOrId);
    if (!rootNode) {
      console.error(chalk.red(`Not found: ${pathOrId}`));
      process.exit(1);
    }

    // If the root IS a task, show its details
    if (rootNode.type === "task") {
      showTaskDetails(rootNode, options);
      return;
    }

    // Get tasks under this root
    tasks = getTasksUnderNode(rootNode.id);

    // Apply status filter
    if (options.status) {
      tasks = tasks.filter((t) => t.task_status === options.status);
    } else if (!options.all) {
      tasks = tasks.filter(
        (t) => t.task_status === "open" || t.task_status === "in_progress"
      );
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

  // Show root context if scoped
  if (rootNode) {
    console.log(chalk.bold(getNodeDisplayName(rootNode, true)));
    console.log();
  }

  // Flat mode: simple single-line display
  if (options.flat) {
    for (const task of tasks) {
      const rawAncestors = getAncestors(task.id);
      const ancestors = collapseRedundantAncestors(rawAncestors);
      const lines = formatTaskWithPath(task, ancestors, {
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

  const indent = "  ";
  let previousAncestorKeys: string[] = [];

  for (const { task, ancestors, ancestorKeys } of sorted) {
    // Find where current path diverges from previous
    let divergeIndex = 0;
    while (
      divergeIndex < previousAncestorKeys.length &&
      divergeIndex < ancestorKeys.length &&
      previousAncestorKeys[divergeIndex] === ancestorKeys[divergeIndex]
    ) {
      divergeIndex++;
    }

    // Print only the new path elements
    for (let i = divergeIndex; i < ancestors.length; i++) {
      const ancestor = ancestors[i];
      const prefix = indent.repeat(i);
      console.log(prefix + chalk.dim(getNodeDisplayName(ancestor, true)));
    }

    // Print the task at its depth
    const taskPrefix = indent.repeat(ancestors.length);
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

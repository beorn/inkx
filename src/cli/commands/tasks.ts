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
  getNode,
  getNodeByPath,
  queryNodes,
  getDb,
} from "../../node/db.ts";
import { parseTaskMetadata, extractTags } from "../../md/parser.ts";
import type { Node, TaskStatus } from "../../node/types.ts";

/**
 * Format a task for display
 */
function formatTask(task: Node, options: { verbose?: boolean } = {}): string {
  const status = task.task_status ?? "open";
  const statusIcon =
    status === "done"
      ? chalk.green("✓")
      : status === "in_progress"
        ? chalk.yellow("◐")
        : status === "blocked"
          ? chalk.red("✗")
          : chalk.dim("○");

  const id = chalk.dim(task.id.slice(0, 8));
  const content = task.content ?? "(no content)";

  let line = `${statusIcon}  ${id}  ${content}`;

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
 * Tasks command group
 */
export const tasksCommand = new Command("tasks")
  .description("Task management commands")
  .action(function (this: Command) {
    // Default action: show help for tasks subcommand
    this.help();
  });

/**
 * List tasks
 */
function listAction(options: {
  status?: string;
  all?: boolean;
  mine?: boolean;
  due?: string;
  verbose?: boolean;
  json?: boolean;
}): void {
  const db = getDb();

  let sql = "SELECT * FROM nodes WHERE type = 'task'";
  const params: unknown[] = [];

  if (options.status) {
    sql += " AND task_status = ?";
    params.push(options.status);
  } else if (!options.all) {
    // Default: show open and in_progress
    sql += " AND task_status IN ('open', 'in_progress')";
  }

  if (options.mine) {
    sql += " AND assigned_to = ?";
    params.push(process.env.USER ?? "user");
  }

  if (options.due) {
    sql += " AND due_date <= ?";
    params.push(options.due);
  }

  sql += " ORDER BY priority ASC NULLS LAST, due_date ASC NULLS LAST, created_at DESC";

  const tasks = db.prepare(sql).all(...params) as Node[];

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  if (tasks.length === 0) {
    console.log(chalk.dim("No tasks found"));
    return;
  }

  for (const task of tasks) {
    console.log(formatTask(task, { verbose: options.verbose }));
  }

  console.log();
  console.log(chalk.dim(`${tasks.length} task(s)`));
}

tasksCommand
  .command("list")
  .alias("ls")
  .description("List tasks")
  .option("-s, --status <status>", "Filter by status (open, in_progress, done, blocked)")
  .option("-a, --all", "Show all tasks including done")
  .option("-m, --mine", "Show only my tasks")
  .option("-d, --due <date>", "Show tasks due by date")
  .option("-v, --verbose", "Show more details")
  .option("--json", "Output as JSON")
  .action(listAction);

/**
 * Add a task
 */
tasksCommand
  .command("add")
  .description("Add a new task")
  .argument("<content...>", "Task content")
  .option("-p, --parent <id>", "Parent node ID")
  .option("-s, --status <status>", "Initial status", "open")
  .option("-d, --due <date>", "Due date (YYYY-MM-DD)")
  .option("-P, --priority <n>", "Priority (1-5)")
  .option("-a, --assign <actor>", "Assign to actor")
  .option("--json", "Output as JSON")
  .action((content, options) => {
    const text = content.join(" ");

    // Parse metadata from content
    const metadata = parseTaskMetadata(text);
    const tags = extractTags(text);

    // Resolve parent
    let parentId: string | null = null;
    if (options.parent) {
      const parent = getNode(options.parent) ?? getNodeByPath(options.parent);
      if (!parent) {
        console.error(chalk.red(`Parent not found: ${options.parent}`));
        process.exit(1);
      }
      parentId = parent.id;
    }

    const nodeId = ulid();
    const event = emitNodeCreated(process.env.USER ?? "user", {
      id: nodeId,
      type: "task",
      parent_id: parentId,
      content: text,
      task_status: (options.status || "open") as TaskStatus,
      task_mark: " ",
      due_date: options.due || metadata.dueDate,
      scheduled_date: metadata.scheduledDate,
      priority: options.priority
        ? parseInt(options.priority, 10)
        : metadata.priority,
      assigned_to: options.assign,
      data: tags.length > 0 ? { tags } : {},
    });

    if (options.json) {
      console.log(JSON.stringify({ id: nodeId, event: event.id }));
      return;
    }

    console.log(chalk.green("Created task:"), nodeId.slice(0, 8));
  });

/**
 * Mark task as done
 */
tasksCommand
  .command("done")
  .description("Mark task as done")
  .argument("<id>", "Task ID (prefix match)")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    const task = findTask(id);
    if (!task) {
      console.error(chalk.red(`Task not found: ${id}`));
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
  });

/**
 * Claim a task
 */
tasksCommand
  .command("claim")
  .description("Claim a task (assign to yourself)")
  .argument("<id>", "Task ID (prefix match)")
  .action((id) => {
    const task = findTask(id);
    if (!task) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    const actor = process.env.USER ?? "user";
    emitNodeUpdated(actor, task.id, {
      assigned_to: actor,
      task_status: "in_progress",
      task_mark: "/",
    });

    console.log(chalk.green("◐"), "Claimed:", task.id.slice(0, 8));
  });

/**
 * Release a task
 */
tasksCommand
  .command("release")
  .description("Release a claimed task")
  .argument("<id>", "Task ID (prefix match)")
  .option("-s, --status <status>", "New status", "open")
  .action((id, options) => {
    const task = findTask(id);
    if (!task) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    emitNodeUpdated(process.env.USER ?? "user", task.id, {
      assigned_to: null,
      task_status: options.status as TaskStatus,
      task_mark: " ",
    });

    console.log(chalk.dim("○"), "Released:", task.id.slice(0, 8));
  });

/**
 * Show task details
 */
tasksCommand
  .command("show")
  .description("Show task details")
  .argument("<id>", "Task ID (prefix match)")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    const task = findTask(id);
    if (!task) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(task, null, 2));
      return;
    }

    console.log(chalk.bold("Task:"), task.id);
    console.log(chalk.dim("Status:"), task.task_status ?? "open");
    console.log(chalk.dim("Content:"), task.content ?? "(none)");
    if (task.due_date) console.log(chalk.dim("Due:"), task.due_date);
    if (task.scheduled_date) console.log(chalk.dim("Scheduled:"), task.scheduled_date);
    if (task.priority) console.log(chalk.dim("Priority:"), task.priority);
    if (task.assigned_to) console.log(chalk.dim("Assigned:"), task.assigned_to);
    if (task.parent_id) console.log(chalk.dim("Parent:"), task.parent_id.slice(0, 8));
    console.log(chalk.dim("Created:"), new Date(task.created_at!).toISOString());
  });

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

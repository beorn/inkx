/**
 * List Command
 *
 * Lists tasks with various filters
 */

import { Command } from "commander";
import chalk from "chalk";
import { getAllTasks, getTasksByStatus, getChildren } from "../../node/db.ts";
import type { Node, TaskStatus } from "../../node/types.ts";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List tasks")
  .option("-s, --status <status>", "Filter by status (open, in_progress, done, blocked)")
  .option("-a, --all", "Show all tasks including done")
  .option("-p, --priority", "Sort by priority")
  .option("-d, --due", "Sort by due date")
  .option("--json", "Output as JSON")
  .action((options) => {
    let tasks: Node[];

    if (options.status) {
      const statuses = options.status.split(",") as TaskStatus[];
      tasks = getTasksByStatus(statuses);
    } else if (options.all) {
      tasks = getAllTasks();
    } else {
      // Default: show open and in_progress
      tasks = getTasksByStatus(["open", "in_progress"]);
    }

    // Additional sorting
    if (options.priority) {
      tasks.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    } else if (options.due) {
      tasks.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    }

    if (options.json) {
      console.log(JSON.stringify(tasks, null, 2));
      return;
    }

    if (tasks.length === 0) {
      console.log(chalk.dim("No tasks found"));
      return;
    }

    for (const task of tasks) {
      console.log(formatTask(task));
    }

    console.log(chalk.dim(`\n${tasks.length} task(s)`));
  });

/**
 * Format a task for display
 */
function formatTask(task: Node): string {
  const parts: string[] = [];

  // Status indicator
  const statusIcon = getStatusIcon(task.task_status);
  parts.push(statusIcon);

  // ID (truncated)
  parts.push(chalk.dim(task.id.slice(0, 8)));

  // Content
  const content = task.content?.slice(0, 60) ?? "(no content)";
  parts.push(content);

  // Due date
  if (task.due_date) {
    const isOverdue = new Date(task.due_date) < new Date();
    const dateStr = chalk[isOverdue ? "red" : "yellow"](task.due_date);
    parts.push(dateStr);
  }

  // Priority
  if (task.priority) {
    const prioStr = chalk.magenta(`P${task.priority}`);
    parts.push(prioStr);
  }

  // Assigned
  if (task.assigned_to) {
    parts.push(chalk.cyan(`@${task.assigned_to}`));
  }

  return parts.join("  ");
}

/**
 * Get status icon
 */
function getStatusIcon(status: TaskStatus | undefined): string {
  switch (status) {
    case "done":
      return chalk.green("✓");
    case "in_progress":
      return chalk.blue("●");
    case "blocked":
      return chalk.red("✗");
    case "waiting":
      return chalk.yellow("◐");
    case "cancelled":
      return chalk.dim("⊘");
    case "scheduled":
      return chalk.cyan("◷");
    default:
      return chalk.dim("○");
  }
}

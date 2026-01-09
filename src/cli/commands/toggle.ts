/**
 * Toggle Command
 *
 * Toggle task status: open → in_progress → done → open
 *
 * km toggle <id>      # Cycle through statuses
 * km toggle <id> -s   # Simple toggle: open ↔ done
 */

import { Command } from "commander";
import chalk from "chalk";
import { getDb } from "../../node/db.ts";
import { emitNodeUpdated } from "../../node/emit.ts";
import type { Node, TaskStatus } from "../../node/types.ts";

/**
 * Find a task by ID or ID prefix
 * Prioritizes tasks over other node types for prefix matching
 */
function findTask(idOrPrefix: string): Node | null {
  const db = getDb();

  // Try exact ID match first (must be a task)
  let node = db
    .prepare("SELECT * FROM nodes WHERE id = ? AND type = 'task'")
    .get(idOrPrefix) as Node | undefined;
  if (node) return node;

  // Try ID prefix match (only tasks)
  node = db
    .prepare("SELECT * FROM nodes WHERE id LIKE ? AND type = 'task' LIMIT 1")
    .get(`${idOrPrefix}%`) as Node | undefined;
  if (node) return node;

  return null;
}

/**
 * Get next status in cycle
 */
function getNextStatus(
  current: TaskStatus | undefined,
  simple: boolean,
): TaskStatus {
  if (simple) {
    // Simple toggle: open ↔ done
    return current === "done" ? "open" : "done";
  }

  // Full cycle: open → in_progress → done → open
  switch (current) {
    case "open":
      return "in_progress";
    case "in_progress":
      return "done";
    case "done":
      return "open";
    default:
      return "in_progress";
  }
}

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
    default:
      return " ";
  }
}

export const toggleCommand = new Command("toggle")
  .description("Toggle task status")
  .argument("<id>", "Task ID or prefix")
  .option("-s, --simple", "Simple toggle: open ↔ done (skip in_progress)")
  .action((id, options) => {
    const node = findTask(id);

    if (!node) {
      console.error(chalk.red(`No task found with ID prefix: ${id}`));
      process.exit(1);
    }

    const currentStatus = (node.task_status as TaskStatus) ?? "open";
    const newStatus = getNextStatus(currentStatus, options.simple ?? false);
    const newMark = getMarkForStatus(newStatus);

    // Emit the update event
    emitNodeUpdated("cli", node.id, {
      task_status: newStatus,
      task_mark: newMark,
    });

    // Status icons
    const statusIcon =
      newStatus === "done"
        ? chalk.green("✓")
        : newStatus === "in_progress"
          ? chalk.yellow("●")
          : chalk.dim("○");

    console.log(
      `${statusIcon} ${chalk.dim(node.id.slice(0, 8))} → ${newStatus}: ${node.content?.slice(0, 50) ?? "(no content)"}`,
    );
  });

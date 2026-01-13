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
import { resolveTask, getStore } from "@km/store";
import type { TaskStatus, TaskMark } from "@km/core";

/**
 * Get next status in cycle
 * Valid statuses: open, blocked, done, dropped
 */
function getNextStatus(
  current: TaskStatus | undefined,
  simple: boolean,
): TaskStatus {
  if (simple) {
    // Simple toggle: open ↔ done
    return current === "done" ? "open" : "done";
  }

  // Full cycle: open → blocked → done → open
  switch (current) {
    case "open":
      return "blocked";
    case "blocked":
      return "done";
    case "done":
      return "open";
    case "dropped":
      return "open";
    default:
      return "blocked";
  }
}

/**
 * Get task mark for status
 */
function getMarkForStatus(status: TaskStatus): TaskMark {
  switch (status) {
    case "done":
      return "x";
    case "blocked":
      return "!";
    case "dropped":
      return "-";
    default:
      return " ";
  }
}

export const toggleCommand = new Command("toggle")
  .description("Toggle task status")
  .argument("<id>", "Task ID, path, or filename")
  .option("-s, --simple", "Simple toggle: open ↔ done (skip in_progress)")
  .action((id, options) => {
    const node = resolveTask(id);

    if (!node) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    const currentStatus = (node.task_status as TaskStatus) ?? "open";
    const newStatus = getNextStatus(currentStatus, options.simple ?? false);
    const newMark = getMarkForStatus(newStatus);

    // Update via store (handles event emission and file sync)
    const store = getStore();
    store.updateNode(node.id, {
      task_status: newStatus,
      task_mark: newMark,
    });

    // Status icons
    const statusIcon =
      newStatus === "done"
        ? chalk.green("✓")
        : newStatus === "blocked"
          ? chalk.yellow("!")
          : chalk.dim("○");

    console.log(
      `${statusIcon} ${chalk.dim(node.id.slice(0, 8))} → ${newStatus}: ${node.content?.slice(0, 50) ?? "(no content)"}`,
    );
  });

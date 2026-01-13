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
import { getTaskByIdPrefix } from "@km/store";
import { emitNodeUpdated } from "@km/core";
import type { TaskStatus } from "@km/core";

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
  .argument("<id>", "Task ID or prefix/suffix")
  .option("-s, --simple", "Simple toggle: open ↔ done (skip in_progress)")
  .action((id, options) => {
    const node = getTaskByIdPrefix(id);

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

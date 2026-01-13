/**
 * Done Command
 *
 * Quick way to mark a task as done
 */

import { Command } from "commander";
import chalk from "chalk";
import { emitNodeUpdated } from "@km/core";
import { getTaskByIdPrefix } from "@km/store";

export const doneCommand = new Command("done")
  .description("Mark a task as done")
  .argument("<id>", "Task ID or prefix/suffix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    // Find task by ID, prefix, or suffix (for short IDs shown with -i flag)
    const node = getTaskByIdPrefix(id);

    if (!node) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (node.task_status === "done") {
      if (options.json) {
        console.log(
          JSON.stringify({ id: node.id, status: "done", unchanged: true }),
        );
        return;
      }
      console.log(chalk.yellow("Task already done"));
      return;
    }

    // Mark as done - this triggers bidirectional sync
    emitNodeUpdated(process.env.USER ?? "user", node.id, {
      task_status: "done",
      task_mark: "x",
    });

    if (options.json) {
      console.log(JSON.stringify({ id: node.id, status: "done" }));
      return;
    }

    console.log(chalk.green("✓"), `Marked done: ${node.content?.slice(0, 50)}`);
  });

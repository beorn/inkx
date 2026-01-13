/**
 * Done Command
 *
 * Quick way to mark a task as done
 */

import { Command } from "commander";
import chalk from "chalk";
import type { Node } from "@km/core";
import { emitNodeUpdated } from "@km/core";
import { getDb } from "@km/store";

/**
 * Find a task by ID or ID prefix
 * Only returns tasks, not other node types
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

export const doneCommand = new Command("done")
  .description("Mark a task as done")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    // Find task by ID or prefix
    const node = findTask(id);

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

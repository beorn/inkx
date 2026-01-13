/**
 * Done Command
 *
 * Quick way to mark a task as done
 * Handles recurring tasks by cloning with next due date
 */

import { Command } from "commander";
import chalk from "chalk";
import { resolveTask, getStore } from "@km/store";
import { getNextOccurrence, naturalToRRule } from "@km/core";

export const doneCommand = new Command("done")
  .description("Mark a task as done")
  .argument("<id>", "Task ID, path, or filename")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    // Find task by ID, prefix, suffix, path, or filename
    const node = resolveTask(id);

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

    const store = getStore();

    // Check for recurrence (from node data or parsed from content)
    const recurrence =
      (node.data?.recurrence as string) ||
      (node.recurrence as string | undefined);

    if (recurrence) {
      // Convert natural language to RRULE if needed
      const rrule = naturalToRRule(recurrence) || recurrence;

      // Calculate next due date
      const baseDate = node.due_date || new Date().toISOString().slice(0, 10);
      const nextDue = getNextOccurrence(rrule, baseDate);

      if (nextDue) {
        // Clone the task with new due date
        const newId = store.cloneTask(node.id, {
          due_date: nextDue,
          task_status: "open",
          task_mark: " ",
        });

        if (options.json) {
          console.log(
            JSON.stringify({
              id: node.id,
              status: "done",
              recurring: true,
              next_id: newId,
              next_due: nextDue,
            }),
          );
        } else {
          console.log(
            chalk.green("✓"),
            `Marked done: ${node.content?.slice(0, 40)}`,
          );
          console.log(chalk.blue("↻"), `Next occurrence: ${nextDue}`);
        }
      }
    }

    // Mark original as done
    store.updateNode(node.id, {
      task_status: "done",
      task_mark: "x",
    });

    if (!recurrence) {
      if (options.json) {
        console.log(JSON.stringify({ id: node.id, status: "done" }));
        return;
      }
      console.log(
        chalk.green("✓"),
        `Marked done: ${node.content?.slice(0, 50)}`,
      );
    }
  });

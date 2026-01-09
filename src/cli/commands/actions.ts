/**
 * Task Action Commands
 *
 * done, claim, release, etc.
 */

import { Command } from "commander";
import chalk from "chalk";
import { getNode } from "../../node/db.ts";
import {
  emitTaskCompleted,
  emitTaskClaimed,
  emitTaskReleased,
  emitNodeUpdated,
} from "../../node/emit.ts";
import type { TaskStatus } from "../../node/types.ts";

/**
 * Done command - mark task as complete
 */
export const doneCommand = new Command("done")
  .description("Mark task as done")
  .argument("<id>", "Task ID")
  .option("-m, --message <msg>", "Completion message")
  .action((id, options) => {
    const node = getNode(id);

    if (!node) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (node.type !== "task") {
      console.error(chalk.red(`Node is not a task: ${node.type}`));
      process.exit(1);
    }

    const actor = process.env.USER ?? "user";
    emitTaskCompleted(id, actor, options.message);

    console.log(chalk.green("✓"), "Marked as done:", id.slice(0, 8));
  });

/**
 * Claim command - assign task to self
 */
export const claimCommand = new Command("claim")
  .description("Claim a task")
  .argument("<id>", "Task ID")
  .action((id) => {
    const node = getNode(id);

    if (!node) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (node.type !== "task") {
      console.error(chalk.red(`Node is not a task: ${node.type}`));
      process.exit(1);
    }

    if (node.assigned_to) {
      console.error(
        chalk.yellow(`Task already assigned to: ${node.assigned_to}`)
      );
      process.exit(1);
    }

    const actor = process.env.USER ?? "user";
    emitTaskClaimed(id, actor);

    console.log(chalk.blue("●"), "Claimed:", id.slice(0, 8));
  });

/**
 * Release command - unassign task
 */
export const releaseCommand = new Command("release")
  .description("Release a claimed task")
  .argument("<id>", "Task ID")
  .option("-r, --reason <reason>", "Reason for release")
  .action((id, options) => {
    const node = getNode(id);

    if (!node) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (node.type !== "task") {
      console.error(chalk.red(`Node is not a task: ${node.type}`));
      process.exit(1);
    }

    const actor = process.env.USER ?? "user";
    emitTaskReleased(id, actor, options.reason);

    console.log(chalk.yellow("○"), "Released:", id.slice(0, 8));
  });

/**
 * Status command - change task status
 */
export const statusCommand = new Command("status")
  .description("Change task status")
  .argument("<id>", "Task ID")
  .argument("<status>", "New status")
  .action((id, status) => {
    const node = getNode(id);

    if (!node) {
      console.error(chalk.red(`Task not found: ${id}`));
      process.exit(1);
    }

    if (node.type !== "task") {
      console.error(chalk.red(`Node is not a task: ${node.type}`));
      process.exit(1);
    }

    const validStatuses: TaskStatus[] = [
      "open",
      "in_progress",
      "done",
      "blocked",
      "waiting",
      "scheduled",
      "cancelled",
    ];

    if (!validStatuses.includes(status as TaskStatus)) {
      console.error(
        chalk.red(`Invalid status: ${status}`),
        "\nValid:",
        validStatuses.join(", ")
      );
      process.exit(1);
    }

    const actor = process.env.USER ?? "user";
    emitNodeUpdated(id, { task_status: status }, actor);

    console.log(chalk.cyan("→"), `Status changed to ${status}:`, id.slice(0, 8));
  });

/**
 * Edit command - update task fields
 */
export const editCommand = new Command("edit")
  .description("Edit task fields")
  .argument("<id>", "Task ID")
  .option("-c, --content <text>", "Update content")
  .option("-d, --due <date>", "Update due date")
  .option("-P, --priority <n>", "Update priority")
  .option("-a, --assign <actor>", "Assign to actor")
  .action((id, options) => {
    const node = getNode(id);

    if (!node) {
      console.error(chalk.red(`Node not found: ${id}`));
      process.exit(1);
    }

    const updates: Record<string, unknown> = {};

    if (options.content) {
      updates.content = options.content;
    }
    if (options.due) {
      updates.due_date = options.due;
    }
    if (options.priority) {
      updates.priority = parseInt(options.priority, 10);
    }
    if (options.assign) {
      updates.assigned_to = options.assign;
    }

    if (Object.keys(updates).length === 0) {
      console.error(chalk.yellow("No updates specified"));
      process.exit(1);
    }

    const actor = process.env.USER ?? "user";
    emitNodeUpdated(id, updates, actor);

    console.log(chalk.green("✓"), "Updated:", id.slice(0, 8));
  });

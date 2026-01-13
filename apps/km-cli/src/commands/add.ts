/**
 * Add Command
 *
 * Add tasks to boards/lists. Re-parent nodes to a target container.
 *
 * km add @next TASKID          # Add task to @next board
 * km add @next ./inbox/**      # Add all inbox tasks to @next
 * km add +project TASKID       # Add task to project
 */

import { Command } from "commander";
import chalk from "chalk";
import { resolveNode, queryTasks, getNode } from "@km/store";
import { emit } from "@km/core";

export const addCommand = new Command("add")
  .description("Add tasks to a board or list")
  .argument("<target>", "Target board/list (ID, path, or filename like @next)")
  .argument("<source...>", "Task IDs or query (e.g., ./inbox/**, status:open)")
  .option("--dry-run", "Preview without making changes")
  .option("--json", "Output as JSON")
  .action((target, sources, options) => {
    // Resolve target board/container
    const targetNode = resolveNode(target);
    if (!targetNode) {
      console.error(chalk.red(`Target not found: ${target}`));
      console.error(
        chalk.dim("Use ID, path, or filename (e.g., @next, @inbox.md)"),
      );
      process.exit(1);
    }

    // Collect tasks to add
    const tasksToAdd: Array<{ id: string; content: string }> = [];

    for (const source of sources) {
      // Try as node ID first
      const node = resolveNode(source, "task");
      if (node) {
        tasksToAdd.push({
          id: node.id,
          content: node.content || "(no content)",
        });
        continue;
      }

      // Try as query
      const queryResults = queryTasks(source);
      if (queryResults.length > 0) {
        for (const task of queryResults) {
          // Don't add duplicates
          if (!tasksToAdd.some((t) => t.id === task.id)) {
            tasksToAdd.push({
              id: task.id,
              content: task.content || "(no content)",
            });
          }
        }
        continue;
      }

      // Nothing found
      console.warn(chalk.yellow(`No tasks found for: ${source}`));
    }

    if (tasksToAdd.length === 0) {
      console.log(chalk.yellow("No tasks to add"));
      process.exit(0);
    }

    // Get target's last child for ordering
    const targetChildren = getNode(targetNode.id);
    let nextIdx = 0;
    if (targetChildren) {
      // Query for max parent_idx
      // For simplicity, just use timestamp-based ordering
      nextIdx = Date.now();
    }

    if (options.dryRun) {
      console.log(chalk.cyan("Dry run - would add:"));
      for (const task of tasksToAdd) {
        console.log(
          `  ${chalk.dim(task.id.slice(0, 8))} ${task.content.slice(0, 50)}`,
        );
      }
      console.log(
        chalk.dim(
          `\nTo: ${targetNode.content || targetNode.fs_path || target}`,
        ),
      );
      return;
    }

    // Move tasks to target
    for (const task of tasksToAdd) {
      emit({
        type: "node_moved",
        actor: process.env.USER || "user",
        target: task.id,
        data: {
          parent_id: targetNode.id,
          parent_idx: nextIdx++,
        },
      });
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          target: targetNode.id,
          added: tasksToAdd.map((t) => t.id),
          count: tasksToAdd.length,
        }),
      );
      return;
    }

    console.log(
      chalk.green("✓"),
      `Added ${tasksToAdd.length} task(s) to ${targetNode.content || target}`,
    );
    for (const task of tasksToAdd.slice(0, 5)) {
      console.log(
        chalk.dim(`  ${task.id.slice(0, 8)} ${task.content.slice(0, 40)}`),
      );
    }
    if (tasksToAdd.length > 5) {
      console.log(chalk.dim(`  ... and ${tasksToAdd.length - 5} more`));
    }
  });

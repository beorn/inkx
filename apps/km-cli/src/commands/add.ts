/**
 * Add Command
 *
 * Add tasks to boards/lists via transclusion (symlink).
 * Tasks are linked to the board without changing their original location.
 *
 * km add @next TASKID          # Link task to @next board
 * km add @next ./inbox/**      # Link all inbox tasks to @next
 * km add +project TASKID       # Link task to project
 */

import { Command } from "commander";
import chalk from "chalk";
import { ulid } from "ulid";
import {
  resolveNode,
  queryTasks,
  getChildren,
  resolvePathArg,
  ensureState,
  emitNodeCreated,
} from "@km/storage";
import type { Node } from "@km/core";
import { getRootPath } from "../index.ts";

export const addCommand = new Command("add")
  .description("Add tasks to a board or list")
  .argument("<target>", "Target board/list (ID, path, or filename like @next)")
  .argument("<source...>", "Task IDs or query (e.g., ./inbox/**, status:todo)")
  .option("--dry-run", "Preview without making changes")
  .option("--json", "Output as JSON")
  .action((target, sources, options) => {
    // Resolve target path argument - may detect vault root
    const resolvedTarget = resolvePathArg(target, getRootPath());
    ensureState(resolvedTarget.vaultRoot, false);

    if (!resolvedTarget.nodeRef) {
      console.error(chalk.red(`Cannot add to a directory`));
      process.exit(1);
    }

    // Resolve target board/container
    const targetNode = resolveNode(resolvedTarget.nodeRef);
    if (!targetNode) {
      console.error(chalk.red(`Target not found: ${target}`));
      console.error(
        chalk.dim("Use ID, path, or filename (e.g., @next, @inbox.md)"),
      );
      process.exit(1);
    }

    // Collect tasks to add (store full node for symlink creation)
    const tasksToAdd: Node[] = [];

    for (const source of sources) {
      // Resolve source path if it's a filesystem path
      const resolvedSource = resolvePathArg(source, resolvedTarget.vaultRoot);

      // Try as node ID/path first
      const nodeRef = resolvedSource.nodeRef || source;
      const node = resolveNode(nodeRef, "task");
      if (node) {
        tasksToAdd.push(node);
        continue;
      }

      // Try as query
      const queryResults = queryTasks(source);
      if (queryResults.length > 0) {
        for (const task of queryResults) {
          // Don't add duplicates
          if (!tasksToAdd.some((t) => t.id === task.id)) {
            tasksToAdd.push(task);
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

    // Find the default column (section with data.rules.default=true)
    // Search recursively through children to find the first default section
    let actualTarget = targetNode;
    const findDefaultSection = (parentId: string): Node | undefined => {
      const children = getChildren(parentId);
      for (const child of children) {
        if (child.type === "section") {
          const rules = child.data?.rules as { default?: boolean } | undefined;
          if (rules?.default) {
            return child;
          }
          // Search deeper
          const found = findDefaultSection(child.id);
          if (found) return found;
        }
      }
      return undefined;
    };
    const defaultColumn = findDefaultSection(targetNode.id);
    if (defaultColumn) {
      actualTarget = defaultColumn;
    }

    // Use timestamp-based ordering for new items
    let nextIdx = Date.now();

    if (options.dryRun) {
      console.log(chalk.cyan("Dry run - would link:"));
      for (const task of tasksToAdd) {
        console.log(
          `  ${chalk.dim(task.id.slice(0, 8))} ${(task.content || "").slice(0, 50)}`,
        );
      }
      console.log(
        chalk.dim(
          `\nTo: ${targetNode.content || targetNode.fs_path || target}`,
        ),
      );
      return;
    }

    // Create symlink nodes in the target (transclusion - tasks stay in original location)
    for (const task of tasksToAdd) {
      // Create a symlink node that points to the original task
      const symlinkId = ulid();
      emitNodeCreated("cli:add", {
        id: symlinkId,
        type: "task",
        parent_id: actualTarget.id,
        parent_idx: nextIdx++,
        symlink_to: task.id, // Points to the original task
        // Copy some properties for display purposes
        content: task.content,
        task_status: task.task_status,
        task_mark: task.task_mark,
      });
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          target: targetNode.id,
          linked: tasksToAdd.map((t) => t.id),
          count: tasksToAdd.length,
        }),
      );
      return;
    }

    console.log(
      chalk.green("✓"),
      `Linked ${tasksToAdd.length} task(s) to ${targetNode.content || target}`,
    );
    for (const task of tasksToAdd.slice(0, 5)) {
      console.log(
        chalk.dim(
          `  ${task.id.slice(0, 8)} ${(task.content || "").slice(0, 40)}`,
        ),
      );
    }
    if (tasksToAdd.length > 5) {
      console.log(chalk.dim(`  ... and ${tasksToAdd.length - 5} more`));
    }
  });

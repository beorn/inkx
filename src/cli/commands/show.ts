/**
 * Show Command
 *
 * Display details of a node
 */

import { Command } from "commander";
import chalk from "chalk";
import { getNodeByIdPrefix, getNodeByPath, getChildren, getSubtree } from "../../node/db.ts";
import type { Node } from "../../node/types.ts";

export const showCommand = new Command("show")
  .description("Show node details")
  .argument("<id>", "Node ID or path")
  .option("-c, --children", "Show children")
  .option("-t, --tree", "Show full subtree")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    const node = getNodeByIdPrefix(id) ?? getNodeByPath(id);

    if (!node) {
      console.error(chalk.red(`Node not found: ${id}`));
      process.exit(1);
    }

    if (options.json) {
      if (options.tree) {
        console.log(JSON.stringify(getSubtree(node.id), null, 2));
      } else if (options.children) {
        console.log(
          JSON.stringify(
            { node, children: getChildren(node.id) },
            null,
            2
          )
        );
      } else {
        console.log(JSON.stringify(node, null, 2));
      }
      return;
    }

    // Display node details
    console.log(chalk.bold("ID:"), node.id);
    console.log(chalk.bold("Type:"), node.type);

    if (node.content) {
      console.log(chalk.bold("Content:"), node.content);
    }

    if (node.task_status) {
      console.log(chalk.bold("Status:"), formatStatus(node.task_status));
    }

    if (node.due_date) {
      console.log(chalk.bold("Due:"), node.due_date);
    }

    if (node.priority) {
      console.log(chalk.bold("Priority:"), node.priority);
    }

    if (node.assigned_to) {
      console.log(chalk.bold("Assigned:"), node.assigned_to);
    }

    if (node.fs_path) {
      console.log(chalk.bold("Path:"), node.fs_path);
    }

    if (node.parent_id) {
      console.log(chalk.bold("Parent:"), node.parent_id.slice(0, 8));
    }

    console.log(chalk.bold("Created:"), new Date(node.created_at).toISOString());
    console.log(chalk.bold("Updated:"), new Date(node.updated_at).toISOString());

    if (Object.keys(node.data).length > 0) {
      console.log(chalk.bold("Data:"), JSON.stringify(node.data, null, 2));
    }

    // Children
    if (options.children || options.tree) {
      const children = options.tree
        ? getSubtree(node.id).slice(1) // Exclude self
        : getChildren(node.id);

      if (children.length > 0) {
        console.log(chalk.bold("\nChildren:"));
        for (const child of children) {
          const prefix = options.tree ? getIndent(child, node.id) : "  ";
          console.log(`${prefix}${formatNodeBrief(child)}`);
        }
      }
    }
  });

/**
 * Format status with color
 */
function formatStatus(status: string): string {
  switch (status) {
    case "done":
      return chalk.green(status);
    case "in_progress":
      return chalk.blue(status);
    case "blocked":
      return chalk.red(status);
    case "waiting":
      return chalk.yellow(status);
    default:
      return status;
  }
}

/**
 * Format a node briefly
 */
function formatNodeBrief(node: Node): string {
  const parts: string[] = [];

  parts.push(chalk.dim(node.id.slice(0, 8)));
  parts.push(chalk.cyan(node.type));

  if (node.content) {
    parts.push(node.content.slice(0, 50));
  }

  return parts.join("  ");
}

/**
 * Get indentation for tree display
 */
function getIndent(node: Node, rootId: string): string {
  let depth = 0;
  let current = node;

  // Count depth from root
  while (current.parent_id && current.parent_id !== rootId) {
    depth++;
    // This is simplified - in real impl would need to traverse
    break;
  }

  return "  ".repeat(depth + 1);
}

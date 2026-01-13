/**
 * Tree Command
 *
 * Display nodes in a tree structure
 */

import { Command } from "commander";
import chalk from "chalk";
import { getChildren, resolveNode } from "@km/store";
import type { Node } from "@km/core";

export const treeCommand = new Command("tree")
  .description("Display node tree")
  .argument("[root]", "Root node ID, path, or filename (default: all roots)")
  .option("-d, --depth <n>", "Maximum depth", "10")
  .option("--tasks", "Only show tasks")
  .option("--files", "Only show files/folders")
  .option("--ids", "Show node IDs")
  .option("--json", "Output as JSON")
  .action((root, options) => {
    const maxDepth = parseInt(options.depth, 10);

    if (options.json) {
      const nodes = root ? [resolveNode(root)] : getRootNodes();
      const tree = buildJsonTree(nodes.filter(Boolean) as Node[], maxDepth);
      console.log(JSON.stringify(tree, null, 2));
      return;
    }

    if (root) {
      const node = resolveNode(root);
      if (!node) {
        console.error(chalk.red(`Node not found: ${root}`));
        process.exit(1);
      }
      printTree(node, "", true, 0, maxDepth, options);
    } else {
      const roots = getRootNodes();
      for (let i = 0; i < roots.length; i++) {
        printTree(roots[i], "", i === roots.length - 1, 0, maxDepth, options);
      }
    }
  });

/**
 * Get root nodes (no parent)
 */
function getRootNodes(): Node[] {
  return getChildren(null);
}

/**
 * Print tree recursively
 */
function printTree(
  node: Node,
  prefix: string,
  isLast: boolean,
  depth: number,
  maxDepth: number,
  options: { tasks?: boolean; files?: boolean; ids?: boolean },
): void {
  // Filter
  if (options.tasks && node.type !== "task") {
    // Still recurse to find tasks
  } else if (options.files && !["file", "folder"].includes(node.type)) {
    // Still recurse to find files
  } else {
    // Print this node
    const connector = isLast ? "└── " : "├── ";
    console.log(prefix + connector + formatNode(node, options.ids));
  }

  if (depth >= maxDepth) {
    return;
  }

  const children = getChildren(node.id);
  const newPrefix = prefix + (isLast ? "    " : "│   ");

  for (let i = 0; i < children.length; i++) {
    printTree(
      children[i],
      newPrefix,
      i === children.length - 1,
      depth + 1,
      maxDepth,
      options,
    );
  }
}

/**
 * Format a node for tree display
 */
function formatNode(node: Node, showIds?: boolean): string {
  const parts: string[] = [];

  // Type icon
  parts.push(getTypeIcon(node));

  // ID (truncated) - only if requested
  if (showIds) {
    parts.push(chalk.dim(node.id.slice(0, 8)));
  }

  // Name/content
  if (node.type === "file" || node.type === "folder") {
    const name = node.data?.name ?? node.fs_path?.split("/").pop() ?? "?";
    parts.push(chalk.bold(name as string));
  } else if (node.type === "section") {
    parts.push(chalk.yellow(node.content?.slice(0, 40) ?? ""));
  } else if (node.type === "task") {
    const mark = node.task_mark ?? " ";
    parts.push(`[${mark}]`);
    parts.push(node.content?.slice(0, 40) ?? "");
  } else {
    parts.push(node.content?.slice(0, 40) ?? chalk.dim("(empty)"));
  }

  return parts.join(" ");
}

/**
 * Get type icon
 */
function getTypeIcon(node: Node): string {
  switch (node.type) {
    case "folder":
      return chalk.blue("📁");
    case "file":
      return chalk.cyan("📄");
    case "section":
      return chalk.yellow("§");
    case "task":
      return node.task_status === "done" ? chalk.green("✓") : chalk.dim("○");
    case "paragraph":
      return chalk.dim("¶");
    case "code":
      return chalk.magenta("⌨");
    case "quote":
      return chalk.dim("❝");
    default:
      return chalk.dim("•");
  }
}

/**
 * Build JSON tree structure
 */
function buildJsonTree(
  nodes: Node[],
  maxDepth: number,
  depth: number = 0,
): object[] {
  if (depth > maxDepth) {
    return [];
  }

  return nodes.map((node) => ({
    ...node,
    children: buildJsonTree(getChildren(node.id), maxDepth, depth + 1),
  }));
}

/**
 * Node Formatting (Layer 1 - Shared)
 *
 * Format nodes for display in CLI commands and TUI components.
 * Extracted from list.ts and show.ts for reuse.
 */

import chalk from "chalk";
import type { Node } from "@km/core";
import {
  getNodeDisplayName as getNodeDisplayNameBase,
  type CollapsedAncestor,
} from "@km/tui-core";
import { getChildren } from "@km/store";

// Bound version with store dependency
const getNodeDisplayName = (
  node: Parameters<typeof getNodeDisplayNameBase>[0],
) => getNodeDisplayNameBase(node, getChildren);

/**
 * Format a collapsed ancestor for display with its type suffix.
 * Used in tree/context displays.
 */
export function formatCollapsedAncestor(
  ca: CollapsedAncestor,
  showId: boolean,
): string {
  let prefix = "";
  if (showId) {
    prefix = chalk.dim(`[${ca.node.id.slice(0, 5)}] `);
  }

  const name = getNodeDisplayName(ca.node);
  if (ca.typeSuffix) {
    return prefix + name + chalk.gray(` ${ca.typeSuffix}`);
  }
  // No collapsed suffix - show individual type indicator
  if (ca.node.type === "folder") {
    return prefix + name + chalk.gray("/");
  } else if (ca.node.type === "file") {
    // Only add .md if name doesn't already end with it
    return prefix + (name.endsWith(".md") ? name : name + chalk.gray(".md"));
  } else if (ca.node.type === "section") {
    const depth = (ca.node.data?.depth as number) ?? 1;
    return prefix + chalk.gray("#".repeat(depth) + " ") + name;
  }
  return prefix + name;
}

/**
 * Format a node for display in listings.
 */
export function formatNode(node: Node, showId: boolean): string {
  let prefix = "";
  if (showId) {
    prefix = chalk.dim(`[${node.id.slice(0, 5)}] `);
  }

  const name = getNodeDisplayName(node);

  switch (node.type) {
    case "folder":
      return prefix + chalk.blue(name) + chalk.gray("/");
    case "file":
      return prefix + chalk.cyan(name);
    case "section": {
      const depth = (node.data?.depth as number) ?? 1;
      return prefix + chalk.gray("#".repeat(depth) + " ") + chalk.yellow(name);
    }
    case "task": {
      const mark = node.task_mark ?? " ";
      const status = node.task_status ?? "todo";
      // Only color the marker character, not the brackets
      const coloredMark =
        status === "done"
          ? chalk.green(mark)
          : status === "wip"
            ? chalk.yellow(mark)
            : status === "blocked"
              ? chalk.red(mark)
              : chalk.dim(mark);
      const checkbox = chalk.dim("[") + coloredMark + chalk.dim("]");
      return prefix + checkbox + " " + (node.content ?? "(no content)");
    }
    case "paragraph":
      return prefix + chalk.dim("¶ ") + (node.content?.slice(0, 50) ?? "");
    default:
      return (
        prefix + chalk.dim("• ") + (node.content?.slice(0, 50) ?? node.type)
      );
  }
}

/**
 * Format task status with color.
 */
export function formatStatus(status: string): string {
  switch (status) {
    case "done":
      return chalk.green(status);
    case "wip":
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
 * Format a node briefly (for tree/children displays).
 */
export function formatNodeBrief(node: Node): string {
  const parts: string[] = [];

  parts.push(chalk.dim(node.id.slice(0, 8)));
  parts.push(chalk.cyan(node.type));

  if (node.content) {
    parts.push(node.content.slice(0, 50));
  }

  return parts.join("  ");
}

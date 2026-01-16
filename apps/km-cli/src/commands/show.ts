/**
 * Show Command
 *
 * Display details of a node
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  resolveNode,
  getChildren,
  getSubtree,
  getBacklinks,
  getOutgoingLinks,
  getNode,
  resolvePathArg,
  ensureState,
} from "@km/storage";
import { getRootPath } from "../index.ts";
import type { DBNode } from "@km/core";
import type { Link } from "@km/storage";
import { formatStatus, formatNodeBrief } from "@km/ink";

export const showCommand = new Command("show")
  .description("Show node details")
  .argument("<id>", "Node ID, path, or filename")
  .option("-c, --children", "Show children")
  .option("-t, --tree", "Show full subtree")
  .option("-l, --links", "Show links (outgoing and backlinks)")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    // Resolve path argument - may initialize store with detected vault root
    const resolved = resolvePathArg(id, getRootPath());
    ensureState(resolved.vaultRoot, false);

    // Directory paths don't resolve to a specific node
    if (!resolved.nodeRef) {
      console.error(
        chalk.red(`Cannot show a directory. Use 'km ls' to list contents.`),
      );
      process.exit(1);
    }

    const node = resolveNode(resolved.nodeRef);

    if (!node) {
      console.error(chalk.red(`Node not found: ${id}`));
      process.exit(1);
    }

    if (options.json) {
      if (options.tree) {
        console.log(JSON.stringify(getSubtree(node.id), null, 2));
      } else if (options.children) {
        console.log(
          JSON.stringify({ node, children: getChildren(node.id) }, null, 2),
        );
      } else {
        console.log(JSON.stringify(node, null, 2));
      }
      return;
    }

    // Display node details
    console.log(chalk.bold("ID:"), node.id);
    console.log(chalk.bold("Type:"), node.type);

    if (node.fs_path) {
      console.log(chalk.bold("Path:"), node.fs_path);
    }

    // Title can be on node.title (in-memory) or node.data.title (from DB)
    const title = node.title || (node.data?.title as string | undefined);
    if (title) {
      console.log(chalk.bold("Title:"), title);
    }

    if (node.content && node.content !== title) {
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

    if (node.parent_id) {
      console.log(chalk.bold("Parent:"), node.parent_id.slice(0, 8));
    }

    console.log(
      chalk.bold("Created:"),
      new Date(node.created_at).toISOString(),
    );
    console.log(
      chalk.bold("Updated:"),
      new Date(node.updated_at).toISOString(),
    );

    // Display refs from data
    const data = node.data as Record<string, unknown>;
    if (
      data.mentions &&
      Array.isArray(data.mentions) &&
      data.mentions.length > 0
    ) {
      console.log(
        chalk.bold("Refs:"),
        data.mentions.map((m: string) => chalk.magenta(`@${m}`)).join(" "),
      );
    }
    if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
      console.log(
        chalk.bold("Tags:"),
        data.tags.map((t: string) => chalk.cyan(`#${t}`)).join(" "),
      );
    }
    if (
      data.projects &&
      Array.isArray(data.projects) &&
      data.projects.length > 0
    ) {
      console.log(
        chalk.bold("Projects:"),
        data.projects.map((p: string) => chalk.yellow(`+${p}`)).join(" "),
      );
    }

    // Show other data if present
    const otherData = { ...data };
    delete otherData.mentions;
    delete otherData.tags;
    delete otherData.projects;
    if (Object.keys(otherData).length > 0) {
      console.log(chalk.bold("Data:"), JSON.stringify(otherData, null, 2));
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

    // Links
    if (options.links) {
      const outgoing = getOutgoingLinks(node.id);
      const backlinks = getBacklinks(node.id);

      if (outgoing.length > 0) {
        console.log(chalk.bold("\nOutgoing links:"));
        for (const link of outgoing) {
          console.log(`  ${formatLink(link)}`);
        }
      }

      if (backlinks.length > 0) {
        console.log(chalk.bold("\nBacklinks:"));
        for (const link of backlinks) {
          console.log(`  ${formatBacklink(link)}`);
        }
      }

      if (outgoing.length === 0 && backlinks.length === 0) {
        console.log(chalk.dim("\nNo links found."));
      }
    }
  });

/**
 * Get indentation for tree display
 */
function getIndent(node: Node, rootId: string): string {
  let depth = 0;
  const current = node;

  // Count depth from root
  while (current.parent_id && current.parent_id !== rootId) {
    depth++;
    // This is simplified - in real impl would need to traverse
    break;
  }

  return "  ".repeat(depth + 1);
}

/**
 * Format an outgoing link
 */
function formatLink(link: Link): string {
  const parts: string[] = [];

  // Target name with section/block
  let target = chalk.cyan(`[[${link.target_name}]]`);
  if (link.section) {
    target = chalk.cyan(`[[${link.target_name}#${link.section}]]`);
  }
  if (link.block_id) {
    target = chalk.cyan(`[[${link.target_name}^${link.block_id}]]`);
  }
  parts.push(target);

  // Resolution status
  if (link.target_id) {
    const targetNode = getNode(link.target_id);
    if (targetNode) {
      parts.push(
        chalk.dim(`→ ${targetNode.fs_path || link.target_id.slice(0, 8)}`),
      );
    }
  } else {
    parts.push(chalk.yellow("(unresolved)"));
  }

  // Alias
  if (link.alias) {
    parts.push(chalk.dim(`"${link.alias}"`));
  }

  return parts.join(" ");
}

/**
 * Format a backlink (incoming link)
 */
function formatBacklink(link: Link): string {
  const sourceNode = getNode(link.source_id);
  const parts: string[] = [];

  if (sourceNode) {
    const sourceName = sourceNode.fs_path
      ? sourceNode.fs_path.split("/").pop()
      : sourceNode.content?.slice(0, 30) || link.source_id.slice(0, 8);
    parts.push(chalk.green(`← ${sourceName}`));
    parts.push(chalk.dim(`(${link.source_id.slice(0, 8)})`));
  } else {
    parts.push(chalk.dim(`← ${link.source_id.slice(0, 8)}`));
  }

  return parts.join(" ");
}

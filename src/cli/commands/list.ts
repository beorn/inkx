/**
 * List Command
 *
 * List nodes with optional filtering and context display.
 * Core command that other views build on.
 *
 * km list [query]              # List all nodes
 * km ls [query]                # Alias
 * km ls --type task            # Filter by type
 * km ls --type task --context  # With ancestor paths (= tasks)
 */

import { Command } from "commander";
import chalk from "chalk";
import { getDb, getAncestors } from "../../node/db.ts";
import type { Node } from "../../node/types.ts";
import {
  getNodeDisplayName,
  collapseAncestorsWithTypes,
  type CollapsedAncestor,
} from "../../shared/tree.ts";

/**
 * Format a collapsed ancestor for display with its type suffix
 */
function formatCollapsedAncestor(
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
    return prefix + name + chalk.gray(".md");
  } else if (ca.node.type === "section") {
    const depth = (ca.node.data?.depth as number) ?? 1;
    return prefix + chalk.gray("#".repeat(depth) + " ") + name;
  }
  return prefix + name;
}

/**
 * Format a node for display
 */
function formatNode(node: Node, showId: boolean): string {
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
      const status = node.task_status ?? "open";
      const checkboxStr = `[${mark}]`;
      const checkbox =
        status === "done"
          ? chalk.green(checkboxStr)
          : status === "in_progress"
            ? chalk.yellow(checkboxStr)
            : status === "blocked"
              ? chalk.red(checkboxStr)
              : chalk.dim(checkboxStr);
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
 * Match a query against a node
 * Query can be: node ID prefix, path pattern, or relative path
 */
function matchesQuery(node: Node, query: string, ancestors: Node[]): boolean {
  // ID prefix match
  if (node.id.toLowerCase().startsWith(query.toLowerCase())) {
    return true;
  }

  // Path match - check node's path and ancestors
  const lowerQuery = query.toLowerCase();

  // Check node's own path/content
  if (node.fs_path?.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  // Check ancestors' paths
  for (const ancestor of ancestors) {
    if (ancestor.fs_path?.toLowerCase().includes(lowerQuery)) {
      return true;
    }
  }

  return false;
}

/**
 * Get nodes filtered by type and query
 */
function getFilteredNodes(options: {
  type?: string;
  query?: string;
  status?: string;
  all?: boolean;
}): Node[] {
  const db = getDb();

  let sql = "SELECT * FROM nodes WHERE 1=1";
  const params: string[] = [];

  // Filter by type
  if (options.type) {
    sql += " AND type = ?";
    params.push(options.type);
  }

  // Filter by status (for tasks)
  if (options.type === "task" && !options.all) {
    if (options.status) {
      sql += " AND task_status = ?";
      params.push(options.status);
    } else {
      // By default, exclude done tasks
      sql += " AND (task_status IS NULL OR task_status != 'done')";
    }
  }

  sql += " ORDER BY parent_idx ASC, created_at DESC";

  let nodes = db.prepare(sql).all(...params) as Node[];

  // Apply query filter if provided
  if (options.query) {
    const query = options.query;
    nodes = nodes.filter((node) => {
      const ancestors = getAncestors(node.id);
      return matchesQuery(node, query, ancestors);
    });
  }

  return nodes;
}

/**
 * Display nodes with context (ancestor paths)
 */
function displayWithContext(
  nodes: Node[],
  options: { showId: boolean; flat: boolean },
): void {
  // Group nodes by their collapsed ancestor paths
  interface NodeWithContext {
    node: Node;
    collapsed: CollapsedAncestor[];
    pathKey: string;
  }

  const nodesWithContext: NodeWithContext[] = nodes.map((node) => {
    const ancestors = getAncestors(node.id);
    const collapsed = collapseAncestorsWithTypes(ancestors);
    const pathKey = collapsed.map((ca) => ca.node.id).join("/");
    return { node, collapsed, pathKey };
  });

  // Sort by path
  nodesWithContext.sort((a, b) => a.pathKey.localeCompare(b.pathKey));

  if (options.flat) {
    // Flat mode: each node on one line with path prefix
    for (const { node, collapsed } of nodesWithContext) {
      const pathParts = collapsed.map((ca) =>
        chalk.dim(formatCollapsedAncestor(ca, false)),
      );
      const pathStr = pathParts.length > 0 ? pathParts.join(" › ") + " › " : "";
      console.log(pathStr + formatNode(node, options.showId));
    }
  } else {
    // Tree mode: show ancestors once, then nodes indented
    let lastPathKey = "";
    for (const { node, collapsed, pathKey } of nodesWithContext) {
      // Print path if different from last
      if (pathKey !== lastPathKey) {
        if (lastPathKey !== "") {
          console.log(); // Blank line between groups
        }
        let depth = 0;
        for (const ca of collapsed) {
          const prefix = " ".repeat(depth);
          console.log(
            prefix + chalk.dim(formatCollapsedAncestor(ca, options.showId)),
          );
          if (ca.node.type !== "section") {
            depth++;
          }
        }
        lastPathKey = pathKey;
      }

      // Print node
      const indent = " ".repeat(Math.max(0, collapsed.length));
      console.log(indent + formatNode(node, options.showId));
    }
  }
}

/**
 * Display nodes without context (simple list)
 */
function displaySimple(nodes: Node[], options: { showId: boolean }): void {
  for (const node of nodes) {
    console.log(formatNode(node, options.showId));
  }
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List nodes")
  .argument("[query]", "Filter by path, ID prefix, or pattern")
  .option(
    "-t, --type <type>",
    "Filter by node type (task, section, file, folder)",
  )
  .option(
    "-s, --status <status>",
    "Filter tasks by status (open, in_progress, done)",
  )
  .option("-a, --all", "Show all (including done tasks)")
  .option("-c, --context", "Show ancestor paths (like tasks command)")
  .option("-i, --id", "Show node IDs")
  .option("-f, --flat", "Flat output with path prefixes")
  .option("--json", "Output as JSON")
  .action((query, options) => {
    const nodes = getFilteredNodes({
      type: options.type,
      query,
      status: options.status,
      all: options.all,
    });

    if (options.json) {
      console.log(JSON.stringify(nodes, null, 2));
      return;
    }

    if (nodes.length === 0) {
      console.log(chalk.dim("No nodes found"));
      return;
    }

    const showId = options.id ?? false;
    const flat = options.flat ?? false;

    if (options.context || options.type === "task") {
      displayWithContext(nodes, { showId, flat });
    } else {
      displaySimple(nodes, { showId });
    }

    console.log(chalk.dim(`\n${nodes.length} node(s)`));
  });

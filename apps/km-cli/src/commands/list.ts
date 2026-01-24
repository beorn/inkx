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
import { createVault, runGenerator, type Vault } from "@km/storage";
import type { KNode } from "@km/core";
import { collapseAncestorsWithTypes, type CollapsedAncestor } from "@km/tree";
import { formatNode, formatCollapsedAncestor } from "@km/tui";

/**
 * Match a query against a node
 * Query can be: node ID prefix, path pattern, or relative path
 */
function matchesQuery(node: KNode, query: string, ancestors: KNode[]): boolean {
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
function getFilteredNodesWithQuery(
  vault: Vault,
  options: {
    type?: string;
    query?: string;
    status?: string;
    all?: boolean;
  },
): KNode[] {
  // Build query expression based on options
  let nodes: KNode[];

  if (options.type === "task") {
    if (options.status) {
      nodes = vault.getTasksByStatus(
        options.status as NonNullable<KNode["task_status"]>,
      );
    } else if (options.all) {
      nodes = vault.getAllTasks();
    } else {
      // Exclude done tasks by default
      nodes = vault.getAllTasks().filter((n) => n.task_status !== "done");
    }
  } else if (options.type) {
    // Use query for other types
    nodes = vault.query(`type:${options.type}`);
  } else {
    // No type filter - get all nodes via subtree from root
    nodes = vault.getChildren(null);
    // Flatten to get all descendants
    const getAllDescendants = (parentId: string | null): KNode[] => {
      const children = vault.getChildren(parentId);
      return children.flatMap((child) => [
        child,
        ...getAllDescendants(child.id),
      ]);
    };
    nodes = getAllDescendants(null);
  }

  // Apply query filter if provided
  if (options.query) {
    const query = options.query;
    nodes = nodes.filter((node) => {
      const ancestors = vault.getAncestors(node.id);
      return matchesQuery(node, query, ancestors);
    });
  }

  return nodes;
}

/**
 * Display nodes with context (ancestor paths)
 */
function displayWithContext(
  vault: Vault,
  nodes: KNode[],
  options: { showId: boolean; flat: boolean },
): void {
  // Group nodes by their collapsed ancestor paths
  interface NodeWithContext {
    node: KNode;
    collapsed: CollapsedAncestor[];
    pathKey: string;
  }

  const nodesWithContext: NodeWithContext[] = nodes.map((node) => {
    const ancestors = vault.getAncestors(node.id);
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
function displaySimple(
  _vault: Vault,
  nodes: KNode[],
  options: { showId: boolean },
): void {
  for (const node of nodes) {
    console.log(formatNode(node, options.showId));
  }
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List nodes")
  .argument("[query]", "Filter by path, ID prefix, -status:done negation")
  .allowUnknownOption()
  .option(
    "-t, --type <type>",
    "Filter by node type (task, section, file, folder)",
  )
  .option("--status <status>", "Filter tasks by status (todo, wip, done)")
  .option("-a, --all", "Show all (including done tasks)")
  .option("-c, --context", "Show ancestor paths (like tasks command)")
  .option("-i, --id", "Show node IDs")
  .option("-f, --flat", "Flat output with path prefixes")
  .option("--json", "Output as JSON")
  .action((query, options) => {
    using vault = runGenerator(createVault());

    const nodes = getFilteredNodesWithQuery(vault, {
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
      displayWithContext(vault, nodes, { showId, flat });
    } else {
      displaySimple(vault, nodes, { showId });
    }

    console.log(chalk.dim(`\n${nodes.length} node(s)`));
  });

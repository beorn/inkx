/**
 * Search Command
 *
 * Full-text search across nodes
 */

import { Command } from "commander";
import chalk from "chalk";
import { search, getAllNodes } from "../../node/db.ts";
import type { Node } from "../../node/types.ts";

export const searchCommand = new Command("search")
  .alias("s")
  .description("Search nodes")
  .argument("<query>", "Search query")
  .option("-t, --type <type>", "Filter by node type")
  .option("-l, --limit <n>", "Maximum results", "20")
  .option("--json", "Output as JSON")
  .action((query, options) => {
    const limit = parseInt(options.limit, 10);

    let results: Node[];

    // Try FTS first
    try {
      results = search(query, limit);
    } catch {
      // Fallback to simple search if FTS fails
      results = simpleSearch(query, limit);
    }

    // Filter by type if specified
    if (options.type) {
      results = results.filter((n) => n.type === options.type);
    }

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(chalk.dim("No results found"));
      return;
    }

    for (const node of results) {
      console.log(formatResult(node, query));
    }

    console.log(chalk.dim(`\n${results.length} result(s)`));
  });

/**
 * Simple search fallback (no FTS)
 */
function simpleSearch(query: string, limit: number): Node[] {
  const allNodes = getAllNodes();
  const lowerQuery = query.toLowerCase();

  return allNodes
    .filter((node) => {
      const content = node.content?.toLowerCase() ?? "";
      return content.includes(lowerQuery);
    })
    .slice(0, limit);
}

/**
 * Format a search result
 */
function formatResult(node: Node, query: string): string {
  const parts: string[] = [];

  // Type icon
  parts.push(getTypeIcon(node.type));

  // ID
  parts.push(chalk.dim(node.id.slice(0, 8)));

  // Content with highlighted match
  if (node.content) {
    const highlighted = highlightMatch(node.content.slice(0, 60), query);
    parts.push(highlighted);
  }

  // Path
  if (node.fs_path) {
    parts.push(chalk.dim(node.fs_path.split("/").pop() ?? ""));
  }

  return parts.join("  ");
}

/**
 * Get type icon
 */
function getTypeIcon(type: string): string {
  switch (type) {
    case "folder":
      return chalk.blue("📁");
    case "file":
      return chalk.cyan("📄");
    case "section":
      return chalk.yellow("§");
    case "task":
      return chalk.dim("○");
    case "paragraph":
      return chalk.dim("¶");
    default:
      return chalk.dim("•");
  }
}

/**
 * Highlight search match in text
 */
function highlightMatch(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return before + chalk.yellow.bold(match) + after;
}

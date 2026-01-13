/**
 * Search Command
 *
 * Full-text search across nodes with support for:
 * - Quoted phrase searches ("exact phrase")
 * - Highlighted matching terms in results
 */

import { Command } from "commander";
import chalk from "chalk";
import { searchWithSnippet, getAllNodes } from "@km/store";
import type { Node } from "@km/core";
import type { SearchResult } from "@km/store";

// Store showIds flag for formatResult
let showIds = false;

export const searchCommand = new Command("search")
  .alias("s")
  .description('Search nodes (supports "quoted phrases")')
  .argument("<query>", "Search query")
  .option("-t, --type <type>", "Filter by node type")
  .option("-l, --limit <n>", "Maximum results", "20")
  .option("--ids", "Show node IDs")
  .option("--json", "Output as JSON")
  .action((query, options) => {
    const limit = parseInt(options.limit, 10);
    showIds = options.ids ?? false;

    let results: SearchResult[];

    // Try FTS with snippet highlighting first
    try {
      results = searchWithSnippet(query, limit, {
        startMark: "\x1b[33;1m", // Bold yellow start
        endMark: "\x1b[0m", // Reset
        ellipsis: "...",
        maxTokens: 32,
      });
    } catch {
      // Fallback to simple search if FTS fails
      const nodes = simpleSearch(query, limit);
      results = nodes.map((node) => ({ node, snippet: node.content ?? "" }));
    }

    // Filter by type if specified
    if (options.type) {
      results = results.filter((r) => r.node.type === options.type);
    }

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(chalk.dim("No results found"));
      return;
    }

    for (const result of results) {
      console.log(formatResult(result));
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
function formatResult(result: SearchResult): string {
  const { node, snippet } = result;
  const parts: string[] = [];

  // Type icon
  parts.push(getTypeIcon(node.type));

  // ID - only if requested
  if (showIds) {
    parts.push(chalk.dim(node.id.slice(0, 8)));
  }

  // Content with FTS5-highlighted snippet (already contains ANSI codes)
  // or fallback to raw content
  if (snippet) {
    // Truncate snippet to reasonable length while preserving ANSI codes
    const displaySnippet =
      snippet.length > 80 ? snippet.slice(0, 80) + "..." : snippet;
    parts.push(displaySnippet);
  } else if (node.content) {
    parts.push(node.content.slice(0, 60));
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

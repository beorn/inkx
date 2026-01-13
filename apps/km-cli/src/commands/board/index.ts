/**
 * Board Command
 *
 * CLI entry point for the boardliner TUI
 */

import { Command } from "commander";
import { runBoard } from "./tui.ts";
import { getRootPath } from "../../index.ts";
import { getStore, resolveNode, getChildren, queryNodes } from "@km/store";
import chalk from "chalk";

export const boardCommand = new Command("board")
  .description("Display interactive boardliner TUI view")
  .argument("[root]", "Root node ID to start board from")
  .option("--no-tui", "Non-interactive mode, just print board")
  .action(async (root, options) => {
    // root argument is now always a node ID (paths are handled by global --root)
    // Get the filesystem root path - prefer explicit --root, fall back to store's rootPath
    const fsPath = getRootPath() || getStore().rootPath;
    await runBoard(root, options.tui !== false, fsPath);
  });

// Subcommand: board add <board> <query>
boardCommand
  .command("add")
  .description("Add nodes matching query to a board column")
  .argument("<board>", "Board/column ID or path (e.g., @next or @next/today)")
  .argument("<query>", "Query to match nodes (e.g., status:open due:today)")
  .option("--json", "Output as JSON")
  .action((board: string, query: string, options: { json?: boolean }) => {
    const store = getStore();

    // Parse board path: @next/today → board=@next, column=today
    const boardPath = board.startsWith("@") ? board.slice(1) : board;
    const parts = boardPath.split("/");
    const boardName = parts[0];
    const columnName = parts[1];

    // Find the board node
    const boardNode = resolveNode(boardName ?? "");
    if (!boardNode) {
      console.error(chalk.red(`Board not found: ${boardName}`));
      process.exit(1);
    }

    // Find the column if specified
    let targetParentId = boardNode.id;
    if (columnName) {
      const columns = getChildren(boardNode.id);
      const col = columns.find(
        (c) =>
          c.content?.toLowerCase() === columnName.toLowerCase() ||
          c.id.startsWith(columnName),
      );
      if (!col) {
        console.error(chalk.red(`Column not found: ${columnName}`));
        process.exit(1);
      }
      targetParentId = col.id;
    }

    // Find nodes matching query
    const nodes = queryNodes(query);
    if (nodes.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ added: 0, nodes: [] }));
      } else {
        console.log(chalk.yellow("No nodes match query"));
      }
      return;
    }

    // Move each node to the target
    const added: string[] = [];
    for (const node of nodes) {
      // Skip if already a child of target
      if (node.parent_id === targetParentId) continue;

      store.moveNode(node.id, targetParentId);
      added.push(node.id);
    }

    if (options.json) {
      console.log(JSON.stringify({ added: added.length, nodes: added }));
    } else {
      console.log(chalk.green(`Added ${added.length} nodes to board`));
    }
  });

// Subcommand: board remove <board> <query>
boardCommand
  .command("remove")
  .description("Remove nodes matching query from a board (move to root)")
  .argument("<board>", "Board/column ID or path (e.g., @next or @next/done)")
  .argument("<query>", "Query to match nodes (e.g., status:done)")
  .option("--json", "Output as JSON")
  .action((board: string, query: string, options: { json?: boolean }) => {
    const store = getStore();

    // Parse board path
    const boardPath = board.startsWith("@") ? board.slice(1) : board;
    const parts = boardPath.split("/");
    const boardName = parts[0];
    const columnName = parts[1];

    // Find the board node
    const boardNode = resolveNode(boardName ?? "");
    if (!boardNode) {
      console.error(chalk.red(`Board not found: ${boardName}`));
      process.exit(1);
    }

    // Get nodes to filter from
    let sourceNodes: ReturnType<typeof getChildren>;
    if (columnName) {
      const columns = getChildren(boardNode.id);
      const col = columns.find(
        (c) =>
          c.content?.toLowerCase() === columnName.toLowerCase() ||
          c.id.startsWith(columnName),
      );
      if (!col) {
        console.error(chalk.red(`Column not found: ${columnName}`));
        process.exit(1);
      }
      sourceNodes = getChildren(col.id);
    } else {
      // Get all cards from all columns
      sourceNodes = [];
      for (const col of getChildren(boardNode.id)) {
        sourceNodes.push(...getChildren(col.id));
      }
    }

    // Filter by query
    const matchingNodes = queryNodes(query);
    const matchingIds = new Set(matchingNodes.map((n) => n.id));

    // Find nodes that are both in source and match query
    const toRemove = sourceNodes.filter((n) => matchingIds.has(n.id));

    if (toRemove.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ removed: 0, nodes: [] }));
      } else {
        console.log(chalk.yellow("No matching nodes to remove"));
      }
      return;
    }

    // Move each node to root (null parent)
    const removed: string[] = [];
    for (const node of toRemove) {
      store.moveNode(node.id, null);
      removed.push(node.id);
    }

    if (options.json) {
      console.log(JSON.stringify({ removed: removed.length, nodes: removed }));
    } else {
      console.log(chalk.green(`Removed ${removed.length} nodes from board`));
    }
  });

// Re-export for testing
export * from "./types.ts";
export * from "./state.ts";
export * from "./render.ts";
export * from "./tui.ts";

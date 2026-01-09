#!/usr/bin/env bun
/**
 * KM CLI
 *
 * Main entry point for the km command
 *
 * km - Knowledge Machine CLI
 * km task - Task management subcommand
 */

import { existsSync, statSync } from "fs";
import { resolve } from "path";
import { Command } from "commander";
import { ensureState } from "../node/rebuild.ts";
import { showCommand } from "./commands/show.ts";
import { treeCommand } from "./commands/tree.ts";
import { syncCommand } from "./commands/sync.ts";
import { watchCommand } from "./commands/watch.ts";
import { rebuildCommand } from "./commands/rebuild.ts";
import { searchCommand } from "./commands/search.ts";
import { taskCommand } from "./commands/tasks.ts";
import { boardCommand } from "./commands/board.ts";
import { listCommand } from "./commands/list.ts";
import { initCommand } from "./commands/init.ts";

const program = new Command();

program
  .name("km")
  .description("Knowledge Machine - The agentic work desk")
  .version("0.1.0");

/**
 * Extract root path from command arguments
 * Returns the first argument if it's a valid directory path
 */
function extractRootPath(cmd: Command): string | undefined {
  const args = cmd.args;
  if (args.length === 0) return undefined;

  const firstArg = args[0];
  if (!firstArg) return undefined;

  // Check if it looks like a path (starts with /, ./, ~, or ..)
  if (!firstArg.startsWith("/") && !firstArg.startsWith("./") &&
      !firstArg.startsWith("~/") && !firstArg.startsWith("..")) {
    return undefined;
  }

  // Expand ~ to home directory
  const expanded = firstArg.startsWith("~")
    ? firstArg.replace("~", process.env.HOME || "")
    : firstArg;
  const resolved = resolve(expanded);

  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return resolved;
  }

  return undefined;
}

// Initialize state on startup (skip for init command)
program.hook("preAction", (thisCommand, actionCommand) => {
  // Don't initialize state for 'init' command - it creates .km/ itself
  const cmdName = actionCommand?.name() ?? thisCommand.name();
  if (cmdName === "init") {
    return;
  }

  // Check if a path argument was provided
  const rootPath = extractRootPath(actionCommand ?? thisCommand);
  ensureState(rootPath);
});

// Register commands
// Core views
program.addCommand(listCommand);      // km list [query] / km ls - list nodes
program.addCommand(treeCommand);      // km tree [query] - show node hierarchy
program.addCommand(showCommand);      // km show <id> - show node details
program.addCommand(boardCommand);     // km board [query] - interactive kanban TUI
program.addCommand(searchCommand);    // km search <query> - full-text search

// Task commands
program.addCommand(taskCommand);      // km task - task management (list, status, assign, etc.)

// Actions
program.addCommand(initCommand);      // km init - create .km/ for disk mode
program.addCommand(syncCommand);      // km sync - sync filesystem
program.addCommand(watchCommand);     // km watch - watch for changes
program.addCommand(rebuildCommand);   // km rebuild - rebuild state

// Default to help if no command specified
program.action(() => {
  program.outputHelp();
});

program.parse();

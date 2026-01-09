#!/usr/bin/env bun
/**
 * KM CLI
 *
 * Main entry point for the km command
 *
 * km - Knowledge management tool
 * km tasks - Task management subcommand
 */

import { Command } from "commander";
import { ensureState } from "../node/rebuild.ts";
import { showCommand } from "./commands/show.ts";
import { treeCommand } from "./commands/tree.ts";
import { syncCommand } from "./commands/sync.ts";
import { watchCommand } from "./commands/watch.ts";
import { rebuildCommand } from "./commands/rebuild.ts";
import { searchCommand } from "./commands/search.ts";
import { tasksCommand } from "./commands/tasks.ts";
import { boardCommand } from "./commands/board.ts";

const program = new Command();

program
  .name("km")
  .description("KM - Local-first knowledge and task management")
  .version("0.1.0");

// Initialize state on startup
program.hook("preAction", () => {
  ensureState();
});

// Register commands
// Knowledge management commands (root level)
program.addCommand(showCommand);      // km show <id> - show any node
program.addCommand(treeCommand);      // km tree - show node hierarchy
program.addCommand(boardCommand);     // km board - interactive boardliner TUI
program.addCommand(searchCommand);    // km search <query> - search all nodes
program.addCommand(syncCommand);      // km sync - sync filesystem
program.addCommand(watchCommand);     // km watch - watch for changes
program.addCommand(rebuildCommand);   // km rebuild - rebuild state

// Task management commands (grouped)
program.addCommand(tasksCommand);     // km tasks [list|add|done|claim|release|show]

// Default to help if no command specified
program.action(() => {
  program.outputHelp();
});

program.parse();

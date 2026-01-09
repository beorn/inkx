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
import { listCommand } from "./commands/list.ts";
import { toggleCommand } from "./commands/toggle.ts";
import { initCommand } from "./commands/init.ts";

const program = new Command();

program
  .name("km")
  .description("Knowledge Machine - The agentic work desk")
  .version("0.1.0");

// Initialize state on startup (skip for init command)
program.hook("preAction", (thisCommand, actionCommand) => {
  // Don't initialize state for 'init' command - it creates .km/ itself
  const cmdName = actionCommand?.name() ?? thisCommand.name();
  if (cmdName === "init") {
    return;
  }
  ensureState();
});

// Register commands
// Core views
program.addCommand(listCommand);      // km list [query] / km ls - list nodes
program.addCommand(treeCommand);      // km tree [query] - show node hierarchy
program.addCommand(showCommand);      // km show <id> - show node details
program.addCommand(boardCommand);     // km board [query] - interactive kanban TUI
program.addCommand(searchCommand);    // km search <query> - full-text search

// Task convenience alias
program.addCommand(tasksCommand);     // km tasks = km ls --type task --context

// Actions
program.addCommand(toggleCommand);    // km toggle <id> - toggle task status
program.addCommand(initCommand);      // km init - create .km/ for disk mode
program.addCommand(syncCommand);      // km sync - sync filesystem
program.addCommand(watchCommand);     // km watch - watch for changes
program.addCommand(rebuildCommand);   // km rebuild - rebuild state

// Default to help if no command specified
program.action(() => {
  program.outputHelp();
});

program.parse();

#!/usr/bin/env bun
/**
 * Kimmi CLI
 *
 * Main entry point for the km command
 */

import { Command } from "commander";
import { ensureState } from "../node/rebuild.ts";
import { listCommand } from "./commands/list.ts";
import { addCommand } from "./commands/add.ts";
import { showCommand } from "./commands/show.ts";
import { treeCommand } from "./commands/tree.ts";
import { doneCommand, claimCommand, releaseCommand } from "./commands/actions.ts";
import { syncCommand } from "./commands/sync.ts";
import { watchCommand } from "./commands/watch.ts";
import { rebuildCommand } from "./commands/rebuild.ts";
import { searchCommand } from "./commands/search.ts";

const program = new Command();

program
  .name("km")
  .description("Kimmi - Local-first knowledge and task management")
  .version("0.1.0");

// Initialize state on startup
program.hook("preAction", () => {
  ensureState();
});

// Register commands
program.addCommand(listCommand);
program.addCommand(addCommand);
program.addCommand(showCommand);
program.addCommand(treeCommand);
program.addCommand(doneCommand);
program.addCommand(claimCommand);
program.addCommand(releaseCommand);
program.addCommand(syncCommand);
program.addCommand(watchCommand);
program.addCommand(rebuildCommand);
program.addCommand(searchCommand);

// Default to list if no command specified
program.action(() => {
  program.outputHelp();
});

program.parse();

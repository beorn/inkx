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
import chalk from "chalk";
import { ensureState } from "@km/store";
import { getStore } from "@km/store";
import { showCommand } from "./commands/show.ts";
import { viewCommand } from "./commands/view.ts";
import { treeCommand } from "./commands/tree.ts";
import { syncCommand } from "./commands/sync.ts";
import { watchCommand } from "./commands/watch.ts";
import { rebuildCommand } from "./commands/rebuild.ts";
import { searchCommand } from "./commands/search.ts";
import { taskCommand } from "./commands/tasks.ts";
import { listCommand } from "./commands/list.ts";
import { initCommand } from "./commands/init.ts";
import { newCommand } from "./commands/new.ts";
import { doneCommand } from "./commands/done.ts";
import { toggleCommand } from "./commands/toggle.ts";
import { moveCommand } from "./commands/move.ts";
import { addCommand } from "./commands/add.ts";
import { daemonCommand } from "./commands/daemon.ts";
import { inboxCommand } from "./commands/inbox.ts";

const program = new Command();

// Global state for resolved root path (set in preAction, used by commands)
let resolvedRootPath: string | undefined;
// Track whether root was explicitly set (vs falling back to cwd)
let rootExplicitlySet = false;

/**
 * Get the resolved root path (for use by commands that need it)
 */
export function getRootPath(): string | undefined {
  return resolvedRootPath;
}

/**
 * Check if root was explicitly set (via --root or KM_ROOT)
 */
export function wasRootExplicit(): boolean {
  return rootExplicitlySet;
}

program
  .name("km")
  .description("Knowledge Machine - The agentic work desk")
  .version("0.1.0")
  .option(
    "-r, --root <path>",
    "Root directory to operate on (overrides KM_ROOT env var)",
  );

/**
 * Resolve a path argument to an absolute directory path
 * Expands ~ and validates the path exists and is a directory
 */
function resolvePath(path: string): string | undefined {
  // Expand ~ to home directory
  const expanded = path.startsWith("~")
    ? path.replace("~", process.env.HOME || "")
    : path;
  const resolved = resolve(expanded);

  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return resolved;
  }

  return undefined;
}

/**
 * Get root path from options, env var, or default to cwd
 */
function getRootFromOptions(opts: { root?: string }): string | undefined {
  // Priority: --root option > KM_ROOT env var > undefined (use cwd)
  const rootArg = opts.root || process.env.KM_ROOT;
  if (rootArg) {
    return resolvePath(rootArg);
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

  // Get root path from global options or env var
  const opts = thisCommand.opts() as { root?: string };
  resolvedRootPath = getRootFromOptions(opts);
  rootExplicitlySet = !!(opts.root || process.env.KM_ROOT);

  // ensureState will search for .km/ if no explicit root was set
  // If root was explicit, don't search ancestors - use the path directly
  ensureState(resolvedRootPath, !rootExplicitlySet);

  // Warn if using cwd in memory mode (no .km/ found, no explicit root)
  const store = getStore();
  if (!rootExplicitlySet && store.mode === "memory") {
    console.error(chalk.yellow(`Using current directory: ${store.rootPath}`));
    console.error(
      chalk.yellow(
        `Hint: Use --root <path> or set KM_ROOT, or run 'km init' for disk mode\n`,
      ),
    );
  }
});

// Register commands
// Core views
program.addCommand(listCommand); // km list [query] / km ls - list nodes
program.addCommand(viewCommand); // km view [root] - interactive TUI (board/tree, press 'v' to toggle)
program.addCommand(treeCommand); // km tree [root] - static tree output (non-interactive)
program.addCommand(showCommand); // km show <id> - show node details
program.addCommand(searchCommand); // km search <query> - full-text search

// Task commands
program.addCommand(taskCommand); // km task - task management (list, status, assign, etc.)

// Actions
program.addCommand(newCommand); // km new - quick capture to inbox
program.addCommand(doneCommand); // km done <id> - mark task as done
program.addCommand(toggleCommand); // km toggle <id> - toggle task status
program.addCommand(moveCommand); // km move <node> <parent> - re-parent a node
program.addCommand(addCommand); // km add <target> <source...> - add tasks to board/list
program.addCommand(inboxCommand); // km inbox - GTD-style inbox processing
program.addCommand(initCommand); // km init - create .km/ for disk mode
program.addCommand(syncCommand); // km sync [--watch] - sync filesystem (with optional continuous watch)
program.addCommand(watchCommand); // km watch - deprecated, use 'km sync --watch' instead
program.addCommand(rebuildCommand); // km rebuild - rebuild state
program.addCommand(daemonCommand); // km daemon {start,stop,status} - background daemon

// Default to help if no command specified
program.action(() => {
  program.outputHelp();
});

program.parse();

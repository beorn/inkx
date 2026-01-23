#!/usr/bin/env bun
/**
 * KM CLI
 *
 * Main entry point for the km command
 *
 * km - Knowledge Machine CLI
 * km task - Task management subcommand
 */

// Must be imported first - before any debug() calls
import "./debug-log.ts";

import { existsSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { Command } from "commander";
import chalk from "chalk";

// @km/storage is imported dynamically in preAction hook to allow
// view command to show "Loading..." before heavy module loading

import { showCommand } from "./commands/show.ts";
import { viewCommand } from "./commands/view.ts";
import { syncCommand } from "./commands/sync.ts";
import { watchCommand } from "./commands/watch.ts";
import { rebuildCommand } from "./commands/rebuild.ts";
import { taskCommand } from "./commands/tasks.ts";
import { listCommand } from "./commands/list.ts";
import { initCommand } from "./commands/init.ts";
import { newCommand } from "./commands/new.ts";
import { statusCommand } from "./commands/status.ts";
import { moveCommand } from "./commands/move.ts";
import { addCommand } from "./commands/add.ts";
import { daemonCommand } from "./commands/daemon.ts";
import { inboxCommand } from "./commands/inbox.ts";
import { shCommand } from "./commands/sh.ts";
import { bdCommand } from "./commands/bd.ts";
import { agentCommand } from "./commands/agent.ts";

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
  )
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .showSuggestionAfterError(true)
  .showHelpAfterError(true)
  .configureOutput({
    outputError: (str, write) => {
      // Improve error messages for unknown commands
      if (str.includes("too many arguments")) {
        const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
        if (args.length > 0) {
          write(chalk.red(`error: unknown command '${args[0]}'\n`));
          write(chalk.dim("Run 'km --help' for available commands.\n"));
          return;
        }
      }
      write(chalk.red(str));
    },
  });

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

// Initialize state on startup (skip for init and view commands)
program.hook("preAction", (thisCommand, actionCommand) => {
  // Don't initialize state for 'init' command - it creates .km/ itself
  // Don't initialize state for 'view' command - it handles its own loading with task progress
  const cmdName = actionCommand?.name() ?? thisCommand.name();
  if (cmdName === "init" || cmdName === "view") {
    return;
  }

  // Get root path from global options or env var
  const opts = thisCommand.opts() as { root?: string };

  // Check if any argument looks like an explicit filesystem path
  // If so, and no --root is set, auto-detect the km root from the path
  const args = actionCommand?.args || [];
  const pathArg = args.find((arg) => isExplicitPath(arg));

  if (pathArg && !opts.root && !process.env.KM_ROOT) {
    // Auto-detect root from the path argument
    const resolution = resolveFsPath(pathArg);
    if (resolution.kmRoot) {
      // Found a .km directory - use its parent as root
      resolvedRootPath = dirname(resolution.kmRoot);
      rootExplicitlySet = true; // Treat as explicit so we don't search ancestors
    } else if (resolution.exists) {
      // No .km found - use the path's directory for memory mode
      resolvedRootPath = resolution.isFile
        ? dirname(resolution.absolutePath)
        : resolution.absolutePath;
      rootExplicitlySet = true;
    }
    // If path doesn't exist, fall through to normal resolution
    // (the command will error when it tries to resolve the node)
  } else {
    resolvedRootPath = getRootFromOptions(opts);
    rootExplicitlySet = !!(opts.root || process.env.KM_ROOT);
  }

  // ensureState will search for .km/ if no explicit root was set
  // If root was explicit, don't search ancestors - use the path directly
  runGenerator(ensureState(resolvedRootPath, !rootExplicitlySet));

  // Warn if using cwd in memory mode (no .km/ found, no explicit root)
  // Skip warning if we auto-detected from a path (user knows what they're doing)
  const store = getStore();
  if (!rootExplicitlySet && store.mode === "memory" && !pathArg) {
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
program.addCommand(listCommand); // km list [query] / km ls - list/search nodes (with FTS)
program.addCommand(viewCommand); // km view [root] - interactive TUI (board/tree, press 'v' to toggle)
program.addCommand(showCommand); // km show <id> [--tree] - show node details or subtree

// Task commands
program.addCommand(taskCommand); // km tasks - task listing with context

// Actions
program.addCommand(newCommand); // km new - quick capture to inbox
program.addCommand(statusCommand); // km status <id> [status] - view/set task status
program.addCommand(moveCommand); // km move <node> <parent> - re-parent a node
program.addCommand(addCommand); // km add <target> <source...> - add tasks to board/list
program.addCommand(inboxCommand); // km inbox - GTD-style inbox processing
program.addCommand(initCommand); // km init - create .km/ for disk mode
program.addCommand(syncCommand); // km sync [--watch] - sync filesystem (with optional continuous watch)
program.addCommand(watchCommand); // km watch - deprecated, use 'km sync --watch' instead
program.addCommand(rebuildCommand); // km rebuild - rebuild state
program.addCommand(daemonCommand); // km daemon {start,stop,status} - background daemon
program.addCommand(shCommand); // km sh [root] - scripting shell for TUI2 debugging
program.addCommand(bdCommand); // km bd - issue tracking (beads-compatible)
program.addCommand(agentCommand); // km agent - AI agent management

// Handle unknown commands with helpful error message
program.action((_options, command) => {
  // If there are extra args, they're unknown commands
  const unknownArgs = command.args;
  if (unknownArgs.length > 0) {
    const unknown = unknownArgs[0];
    console.error(chalk.red(`error: unknown command '${unknown}'`));

    // Try to suggest similar commands
    const availableCommands = program.commands.map((cmd) => cmd.name());
    const suggestion = availableCommands.find(
      (cmd) =>
        cmd.startsWith(unknown[0] ?? "") || unknown.startsWith(cmd[0] ?? ""),
    );
    if (suggestion) {
      console.error(chalk.yellow(`\nDid you mean: km ${suggestion}?`));
    }
    console.error(chalk.dim("\nRun 'km --help' for available commands."));
    process.exitCode = 1;
  } else {
    // No arguments - show help
    program.outputHelp();
  }
});

program.parse();

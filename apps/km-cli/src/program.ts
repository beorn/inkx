/**
 * KM CLI Program Configuration
 *
 * Exports the configured Commander program for both CLI and programmatic use.
 * This module sets up all commands but doesn't call parse() - that's done by index.ts
 */

// Must be imported first - before any debug() calls
import "./debug-log.ts"

import { existsSync, statSync } from "fs"
import { dirname, resolve } from "path"
import { Command } from "commander"
import chalk from "chalk"
import { setLogLevel, type LogLevel } from "@km/core"

// @km/storage is imported dynamically in preAction hook to allow
// view command to show "Loading..." before heavy module loading

import { showCommand } from "./commands/show.ts"
import { viewCommand } from "./commands/view.ts"
import { syncCommand } from "./commands/sync.ts"
import { watchCommand } from "./commands/watch.ts"
import { rebuildCommand } from "./commands/rebuild.ts"
import { taskCommand } from "./commands/tasks.ts"
import { listCommand } from "./commands/list.ts"
import { initCommand } from "./commands/init.ts"
import { newCommand } from "./commands/new.ts"
import { statusCommand } from "./commands/status.ts"
import { moveCommand } from "./commands/move.ts"
import { addCommand } from "./commands/add.ts"
import { daemonCommand } from "./commands/daemon.ts"
import { inboxCommand } from "./commands/inbox.ts"
import { shCommand } from "./commands/sh.ts"
import { bdCommand } from "./commands/bd.ts"
import { agentCommand } from "./commands/agent.ts"
import { statsCommand } from "./commands/stats.ts"
import { screenshotCommand } from "./commands/screenshot.ts"

export const program = new Command()

// Global state for resolved root path (set in preAction, used by commands)
let resolvedRootPath: string | undefined
// Track whether root was explicitly set (vs falling back to cwd)
let rootExplicitlySet = false

/**
 * Get the resolved root path (for use by commands that need it)
 */
export function getRootPath(): string | undefined {
  return resolvedRootPath
}

/**
 * Check if root was explicitly set (via --root or KM_ROOT)
 */
export function wasRootExplicit(): boolean {
  return rootExplicitlySet
}

program
  .name("km")
  .description("Knowledge Machine - The agentic work desk")
  .version("0.1.0")
  .option(
    "-r, --root <path>",
    "Root directory to operate on (overrides KM_ROOT env var)",
  )
  .option("--silent", "Suppress output except errors")
  .option(
    "-v, --verbose",
    "Increase verbosity (-v, -vv, -vvv)",
    (_, prev) => (prev ?? 0) + 1,
    0,
  )
  .option(
    "--log-level <level>",
    "Log level (trace|debug|verbose|info|warn|error|silent)",
  )
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .showSuggestionAfterError(true)
  .showHelpAfterError(true)
  .configureOutput({
    outputError: (str, write) => {
      // Improve error messages for unknown commands
      if (str.includes("too many arguments")) {
        const args = process.argv.slice(2).filter((a) => !a.startsWith("-"))
        if (args.length > 0) {
          write(chalk.red(`error: unknown command '${args[0]}'\n`))
          write(chalk.dim("Run 'km --help' for available commands.\n"))
          return
        }
      }
      write(chalk.red(str))
    },
  })

// Pre-action hook: runs before any command
program.hook("preAction", async (thisCommand, actionCommand) => {
  // Find options from the command chain (global options may be on parent)
  let cmd: Command | null = actionCommand
  let rootOption: string | undefined
  let silentOption: boolean | undefined
  let verboseOption: number | undefined
  let logLevelOption: string | undefined

  while (cmd) {
    const opts = cmd.opts()
    rootOption ??= opts.root
    silentOption ??= opts.silent
    verboseOption ??= opts.verbose
    logLevelOption ??= opts.logLevel
    cmd = cmd.parent
  }

  // Determine log level (in order of precedence: --log-level, --silent, --verbose)
  let logLevel: LogLevel = "info" // default
  if (logLevelOption) {
    logLevel = logLevelOption as LogLevel
  } else if (silentOption) {
    logLevel = "silent"
  } else if (verboseOption) {
    if (verboseOption >= 3) logLevel = "trace"
    else if (verboseOption === 2) logLevel = "debug"
    else if (verboseOption === 1) logLevel = "verbose"
  }
  setLogLevel(logLevel)

  // Resolve root path
  // Precedence: --root flag > KM_ROOT env var > first positional arg (if path) > cwd
  const rootFlag = rootOption
  const rootEnv = process.env.KM_ROOT

  // Check if command has a positional [path] argument (e.g., view [root])
  const cmdArgs = actionCommand.args
  let pathArg: string | undefined
  if (cmdArgs.length > 0) {
    const firstArg = cmdArgs[0] as string
    // Only treat it as a path if it looks like one (starts with . or / or ~)
    // Don't treat @tags, +projects, query strings as paths
    if (
      typeof firstArg === "string" &&
      (firstArg.startsWith(".") ||
        firstArg.startsWith("/") ||
        firstArg.startsWith("~"))
    ) {
      pathArg = firstArg
    }
  }

  let rootPath: string
  if (rootFlag) {
    rootPath = resolve(rootFlag)
    rootExplicitlySet = true
  } else if (rootEnv) {
    rootPath = resolve(rootEnv)
    rootExplicitlySet = true
  } else if (pathArg) {
    // Auto-detect from path argument
    rootPath = resolve(pathArg)
    // Check if it's a file (use its parent) or directory
    try {
      const stats = statSync(rootPath)
      if (!stats.isDirectory()) {
        rootPath = dirname(rootPath)
      }
    } catch {
      // Path doesn't exist yet - use as-is
    }
    rootExplicitlySet = false // User didn't explicitly set root, we inferred it
  } else {
    rootPath = process.cwd()
    rootExplicitlySet = false
  }

  resolvedRootPath = rootPath

  // Import @km/storage here (after log level is set) to allow
  // view command to show "Loading..." before heavy imports
  const { createVault } = await import("@km/storage")
  const vault = await createVault(rootPath)

  // Warn if using cwd in memory mode (no .km/ found, no explicit root)
  // Skip warning if we auto-detected from a path (user knows what they're doing)
  if (!rootExplicitlySet && vault.mode === "memory" && !pathArg) {
    console.error(chalk.yellow(`Using current directory: ${vault.path}`))
    console.error(
      chalk.yellow(
        `Hint: Use --root <path> or set KM_ROOT, or run 'km init' for disk mode\n`,
      ),
    )
  }
})

// Register commands
// Core views
program.addCommand(listCommand) // km list [query] / km ls - list/search nodes (with FTS)
program.addCommand(viewCommand) // km view [root] - interactive TUI (board/tree, press 'v' to toggle)
program.addCommand(showCommand) // km show <id> [--tree] - show node details or subtree

// Task commands
program.addCommand(taskCommand) // km tasks - task listing with context

// Actions
program.addCommand(newCommand) // km new - quick capture to inbox
program.addCommand(statusCommand) // km status <id> [status] - view/set task status
program.addCommand(moveCommand) // km move <node> <parent> - re-parent a node
program.addCommand(addCommand) // km add <target> <source...> - add tasks to board/list
program.addCommand(inboxCommand) // km inbox - GTD-style inbox processing
program.addCommand(initCommand) // km init - create .km/ for disk mode
program.addCommand(syncCommand) // km sync [--watch] - sync filesystem (with optional continuous watch)
program.addCommand(watchCommand) // km watch - deprecated, use 'km sync --watch' instead
program.addCommand(rebuildCommand) // km rebuild - rebuild state
program.addCommand(daemonCommand) // km daemon {start,stop,status} - background daemon
program.addCommand(shCommand) // km sh [root] - scripting shell for TUI2 debugging
program.addCommand(bdCommand) // km bd - issue tracking (beads-compatible)
program.addCommand(agentCommand) // km agent - AI agent management
program.addCommand(statsCommand) // km stats [path] - vault statistics (domain object example)
program.addCommand(screenshotCommand) // km screenshot [root] - capture TUI as text

// Handle unknown commands with helpful error message
program.action((_options, command) => {
  // If there are extra args, they're unknown commands
  const unknownArgs = command.args
  if (unknownArgs.length > 0) {
    const unknown = unknownArgs[0]
    console.error(chalk.red(`error: unknown command '${unknown}'`))

    // Try to suggest similar commands
    const availableCommands = program.commands.map((cmd) => cmd.name())
    const suggestion = availableCommands.find(
      (cmd) =>
        cmd.startsWith(unknown[0] ?? "") || unknown.startsWith(cmd[0] ?? ""),
    )
    if (suggestion) {
      console.error(chalk.yellow(`\nDid you mean: km ${suggestion}?`))
    }
    console.error(chalk.dim("\nRun 'km --help' for available commands."))
    process.exitCode = 1
  } else {
    // No arguments - show help
    program.outputHelp()
  }
})

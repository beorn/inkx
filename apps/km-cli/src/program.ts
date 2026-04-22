/**
 * KM CLI Program Configuration
 *
 * Exports configureProgram() function that returns a configured Commander program.
 * This module sets up all commands but doesn't call parse() - that's done by index.ts
 */

// Must be imported first - before any debug() calls
import "./debug-log.ts"

import { Command, type OptionValues } from "@silvery/commander"
import { existsSync, statSync } from "fs"
import { createTerm } from "@silvery/ag-react"
import { dirname, join, resolve } from "path"
import { findKmRootFromPath } from "@km/fs-mount"

const term = createTerm(process)

import { type LogLevel } from "@km/core"
import { setLogLevel } from "loggily"

/** Global options available on the root program */
interface GlobalOptions extends OptionValues {
  repo?: string
  silent?: boolean
  verbose?: number
  quiet?: number
  logLevel?: string
}

// @km/storage is imported dynamically in preAction hook to allow
// view command to show "Loading..." before heavy module loading

import { addCommand } from "./commands/add.ts"
import { agentCommand } from "./commands/agent.ts"
import { bdCommand } from "./commands/bd.ts"
import { daemonCommand } from "./commands/daemon.ts"
import { doctorCommand } from "./commands/doctor.ts"
import { importCommand } from "./commands/import.ts"
import { inboxCommand } from "./commands/inbox.ts"
import { initCommand } from "./commands/init.ts"
import { listCommand } from "./commands/list.ts"
import { moveCommand } from "./commands/move.ts"
import { newCommand } from "./commands/new.ts"
import { perfCommand } from "./commands/perf.ts"
import { termtestCommand } from "./commands/termtest.ts"
import { screenshotCommand } from "./commands/screenshot.ts"
import { shCommand } from "./commands/sh.ts"
import { showCommand } from "./commands/show.ts"
import { statsCommand } from "./commands/stats.ts"
import { statusCommand } from "./commands/status.ts"
import { syncCommand } from "./commands/sync.ts"
import { taskCommand } from "./commands/tasks.ts"
import { viewCommand } from "./commands/view.ts"
import { watchCommand } from "./commands/watch.ts"

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
 * Configure and return the km CLI program
 *
 * This function creates a fresh Commander program instance with all commands
 * and configuration. It does NOT call parse() - that's the caller's responsibility.
 *
 * @returns Configured Commander program ready for parseAsync()
 */
export function configureProgram(): Command {
  const program = new Command()

  program
    .name("km")
    .description("Knowledge Machine - The agentic work desk")
    .version("0.1.0")
    .option("-r, --repo <path>", "Repository directory to operate on (overrides KM_ROOT env var)")
    .option("-s, --silent", "Suppress output except errors")
    .option(
      "-v, --verbose",
      "Increase verbosity (-v=info, -vv=debug, -vvv=trace)",
      (_: string, prev: number) => (prev ?? 0) + 1,
      0,
    )
    .option("-q, --quiet", "Decrease verbosity (-q=error, -qq=silent)", (_: string, prev: number) => (prev ?? 0) + 1, 0)
    .option("--log-level <level>", "Log level", ["trace", "debug", "info", "warn", "error", "silent"])
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
            write(term.red(`error: unknown command '${args[0]}'\n`))
            write(term.dim("Run 'km --help' for available commands.\n"))
            return
          }
        }
        write(term.red(str))
      },
    })
    .addHelpSection("Getting Started:", [
      ["km init", "Initialize km in current directory"],
      ["km view", "Open interactive TUI (Kanban board)"],
      ['km new "My first task"', "Create a task in inbox"],
      ["km list", "List all nodes"],
    ])
    .addHelpSection("Quick Actions:", [
      ["km view @next", "View your Next Actions board"],
      ["km add @next <id>", "Add task to Next Actions board"],
      ["km tasks", "List tasks with context"],
      ["km status <id> done", "Mark task complete"],
      ["km bd ready", "Show issues ready to work on"],
    ])
    .addHelpSection("Environment:", [
      ["KM_ROOT=<path>", "Set default repository path"],
      ["LOG_LEVEL=<level>", "Set log level (trace|debug|info|warn|error|silent)"],
    ])
    .addHelpSection("Verbosity:", [
      ["-v, -vv, -vvv", "Increase verbosity (-v=info, -vv=debug, -vvv=trace)"],
      ["-q, -qq", "Decrease verbosity (-q=error, -qq=silent)"],
      ["-v -q", "Offset (cancels out to warn)"],
    ])

  // Pre-action hook: runs before any command
  program.hook("preAction", (thisCommand, actionCommand) => {
    // Find options from the command chain (global options may be on parent)
    let cmd: typeof actionCommand | null = actionCommand
    let rootOption: string | undefined
    let silentOption: boolean | undefined
    let verboseOption: number | undefined
    let quietOption: number | undefined
    let logLevelOption: string | undefined

    while (cmd) {
      const opts = cmd.opts() as GlobalOptions
      rootOption ??= opts.repo
      silentOption ??= opts.silent
      verboseOption ??= typeof opts.verbose === "number" ? opts.verbose : undefined
      quietOption ??= typeof opts.quiet === "number" ? opts.quiet : undefined
      logLevelOption ??= opts.logLevel
      cmd = cmd.parent
    }

    // Determine log level
    // Precedence: --log-level > --silent > -v/-q offset
    // Log level index: trace=0, debug=1, info=2, warn=3, error=4, silent=5
    const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "silent"]
    let logLevel: LogLevel = "warn" // default (index 3)
    if (logLevelOption) {
      logLevel = logLevelOption as LogLevel
    } else if (silentOption) {
      logLevel = "silent"
    } else {
      // Apply -v/-q offset from default (warn=3)
      // -v decreases index (more verbose), -q increases index (quieter)
      const offset = (quietOption ?? 0) - (verboseOption ?? 0)
      const baseIndex = 3 // warn
      let targetIndex = Math.max(0, Math.min(5, baseIndex + offset))
      // DEBUG or DEBUG_LOG set a floor of "debug" (index 1)
      if (process.env.DEBUG || process.env.DEBUG_LOG) {
        targetIndex = Math.min(targetIndex, 1)
      }
      logLevel = LOG_LEVELS[targetIndex] ?? "warn"
    }
    setLogLevel(logLevel)

    // Resolve root path
    // Precedence: --repo flag > KM_ROOT env var > first positional arg (if path) > cwd
    const rootFlag = rootOption
    const rootEnv = process.env.KM_ROOT

    // Check if command has a positional [path] argument (e.g., view [root])
    const cmdArgs = actionCommand.args
    let pathArg: string | undefined
    if (cmdArgs.length > 0) {
      const firstArg = cmdArgs[0]
      // Only treat it as a path if it looks like one (starts with . or / or ~)
      // Don't treat @tags, +projects, query strings as paths
      // Don't treat glob patterns (containing *) as paths - they're query patterns
      if (
        typeof firstArg === "string" &&
        !firstArg.includes("*") &&
        (firstArg.startsWith(".") || firstArg.startsWith("/") || firstArg.startsWith("~"))
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

    // Walk up parent directories to find .km/ (like git finds .git/)
    const kmDir = join(rootPath, ".km")
    if (!existsSync(kmDir)) {
      const found = findKmRootFromPath(rootPath)
      if (found) {
        rootPath = dirname(found)
      }
    }

    resolvedRootPath = rootPath

    // Warn if using cwd in memory mode (no .km/ found, no explicit root)
    // Skip warning if we auto-detected from a path (user knows what they're doing)
    const isMemoryMode = !existsSync(join(rootPath, ".km"))
    if (!rootExplicitlySet && isMemoryMode && !pathArg) {
      console.error(term.yellow(`Using current directory: ${rootPath}`))
      console.error(term.yellow(`Hint: Use --repo <path> or set KM_ROOT, or run 'km init' for disk mode\n`))
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
  program.addCommand(doctorCommand) // km doctor - diagnose and repair stores
  program.addCommand(daemonCommand) // km daemon {start,stop,status} - background daemon
  program.addCommand(shCommand) // km sh [root] - scripting shell for TUI2 debugging
  program.addCommand(bdCommand) // km bd - issue tracking (beads-compatible)
  program.addCommand(agentCommand) // km agent - AI agent management
  program.addCommand(statsCommand) // km stats [path] - repo statistics (domain object example)
  program.addCommand(screenshotCommand) // km screenshot [root] - capture TUI as text
  // NOTE: worktree management lives at `bun worktree` (package.json script),
  // not under `km` — it's a km dev-setup tool, not a km-app command.
  program.addCommand(perfCommand) // km perf analyze <file> - performance trace analysis
  program.addCommand(termtestCommand) // km termtest - visual terminal capability test
  program.addCommand(importCommand) // km import asana <file> | --fetch - import from external tools

  // Handle unknown commands with helpful error message
  program.action((_options, command) => {
    // If there are extra args, they're unknown commands
    const unknownArgs = command.args
    if (unknownArgs.length > 0) {
      const unknown = String(unknownArgs[0])
      console.error(term.red(`error: unknown command '${unknown}'`))

      // Try to suggest similar commands
      const availableCommands = program.commands.map((cmd) => cmd.name())
      const suggestion = availableCommands.find(
        (cmd) => cmd.startsWith(unknown[0] ?? "") || unknown.startsWith(cmd[0] ?? ""),
      )
      if (suggestion) {
        console.error(term.yellow(`\nDid you mean: km ${suggestion}?`))
      }
      console.error(term.dim("\nRun 'km --help' for available commands."))
      process.exitCode = 1
    } else {
      // No arguments - show help
      program.outputHelp()
    }
  })

  return program
}

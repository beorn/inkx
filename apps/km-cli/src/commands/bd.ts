/**
 * Beads Command (bd)
 *
 * Thin proxy to the standalone `bd` binary with km-specific native commands.
 * Tier 1-4 commands (list, show, create, update, close, ready, dep, search,
 * query, blocked, stale, children, epic, etc.) proxy directly to bd.
 * Tier 5 commands (info, where, config, migrate, export) are handled natively.
 */

import { Command } from "@commander-js/extra-typings"
import { spawnSync } from "child_process"
import { createTerm } from "inkx"
import { join } from "path"
import { existsSync } from "fs"
import { resolvePathArg, loadConfigObject } from "@km/storage"
import { queryIssues } from "@km/beads"
import { loadRepo } from "../load-repo.ts"

// Import Tier 5 native subcommands
import { configCommand } from "./bd-config.ts"
import { migrateCommand, exportCommand } from "./bd-migrate.ts"

const term = createTerm(process)

/**
 * Resolve km repo root, falling back to cwd on error.
 */
function getRepoRoot(): string {
  try {
    return resolvePathArg(undefined).repoRoot
  } catch {
    return process.cwd()
  }
}

/**
 * Proxy args to the standalone bd binary.
 * Runs from km repo root with inherited env (BD_ACTOR set by session prehook).
 */
function proxyToBd(args: string[]): void {
  const result = spawnSync("bd", args, {
    cwd: getRepoRoot(),
    env: process.env,
    stdio: "inherit",
  })

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException
    if (err.code === "ENOENT") {
      console.error(term.red("bd binary not found. Install with: brew install beads"))
    } else {
      console.error(term.red(`Failed to run bd: ${result.error.message}`))
    }
    process.exitCode = 1
    return
  }

  if (result.status !== null && result.status !== 0) {
    process.exitCode = result.status
  }
}

/**
 * Native handler: km bd info [scope]
 * Shows km+beads combined configuration and statistics.
 */
// oxlint-disable-next-line complexity/complexity -- CLI info display with sequential reporting steps
async function handleInfo(args: string[]): Promise<void> {
  const scope = args[0]
  const resolved = resolvePathArg(scope)
  const kmDir = join(resolved.repoRoot, ".km")

  using repo = await loadRepo(resolved.repoRoot)
  const scopePath = resolved.nodeRef ?? undefined
  const configObj = loadConfigObject(resolved.repoRoot)
  const config = configObj.beads
  const dbPath = join(kmDir, "state.db")
  const repoMode = repo.mode

  const boardTag = config.board || undefined
  const issues = queryIssues({}, scopePath, boardTag, { repo })

  console.log(term.bold("Beads Configuration"))
  console.log("===================")
  console.log(`Board:  ${config.board || term.dim("(none - showing all tasks)")}`)
  console.log(`Parent: ${config.parent || term.dim("(none - create manually)")}`)
  console.log(`Prefix: ${config.prefix}`)
  if (configObj.path) {
    console.log(term.dim(`Config: ${configObj.path}`))
  }

  console.log()
  console.log(term.bold("How tasks are tracked:"))
  if (config.board) {
    console.log(`  Tasks tagged @${config.board} are shown by 'km bd' commands.`)
    console.log(`  View the board with 'km view @${config.board}'.`)
  } else {
    console.log(`  All tasks in the repo are shown (no board filter configured).`)
    console.log(`  Set beads.board in .km/config.yaml to filter to a specific board.`)
  }
  if (config.parent) {
    console.log(`  New issues will be created in ${config.parent}.`)
  }

  console.log()
  console.log(term.bold("Storage"))
  console.log(`  Database: ${dbPath}`)
  console.log(`  Mode: ${repoMode}`)
  console.log(`  Repo: ${resolved.repoRoot}`)
  console.log(`  KM Dir: ${kmDir}`)
  if (scopePath) {
    console.log(`  Scope: ${scopePath}`)
  }

  console.log()
  const scopeMsg = scopePath ? ` in ${scopePath}` : boardTag ? ` on @${boardTag}` : ""
  console.log(term.bold(`Statistics${scopeMsg}`))
  console.log(`  Total: ${issues.length} issues`)

  const byStatus = {
    open: issues.filter((i) => i.status === "todo").length,
    in_progress: issues.filter((i) => i.status === "wip").length,
    blocked: issues.filter((i) => i.status === "blocked").length,
    closed: issues.filter((i) => i.status === "done").length,
    dropped: issues.filter((i) => i.status === "dropped").length,
  }
  if (issues.length > 0) {
    console.log(`  Open: ${byStatus.open}, In Progress: ${byStatus.in_progress}, Blocked: ${byStatus.blocked}`)
    console.log(`  Closed: ${byStatus.closed}, Dropped: ${byStatus.dropped}`)

    const pathsWithTasks = new Set<string>()
    for (const issue of issues) {
      if (issue.path) {
        pathsWithTasks.add(issue.path)
      }
    }
    if (pathsWithTasks.size > 0) {
      console.log()
      console.log(term.bold("Files with tasks:"))
      const paths = Array.from(pathsWithTasks).slice(0, 5)
      for (const path of paths) {
        const count = issues.filter((i) => i.path === path).length
        console.log(term.dim(`  ${path} (${count})`))
      }
      if (pathsWithTasks.size > 5) {
        console.log(term.dim(`  ... and ${pathsWithTasks.size - 5} more files`))
      }
    }
  }
}

/**
 * Native handler: km bd where [scope]
 * Shows km-specific paths and configuration.
 */
function handleWhere(args: string[]): void {
  const scope = args[0]
  const resolved = resolvePathArg(scope)
  const kmDir = join(resolved.repoRoot, ".km")
  const dbPath = join(kmDir, "state.db")
  const configObj = loadConfigObject(resolved.repoRoot)

  if (existsSync(kmDir)) {
    console.log(kmDir)
    console.log(`  prefix: ${configObj.beads.prefix}`)
    console.log(`  board: ${configObj.beads.board || "(none)"}`)
    console.log(`  parent: ${configObj.beads.parent || "(none)"}`)
    console.log(`  database: ${dbPath}`)
    console.log(`  repo: ${resolved.repoRoot}`)
    if (resolved.nodeRef) {
      console.log(`  scope: ${resolved.nodeRef}`)
    }
  } else {
    console.log(term.yellow("No km directory found."))
    console.log(`  repo: ${resolved.repoRoot}`)
  }
}

export const bdCommand = new Command("bd")
  .description("Issue tracking (proxy to bd with km defaults)")
  .allowExcessArguments(true)
  .allowUnknownOption(true)
  .addHelpText(
    "after",
    `
Most commands proxy to the standalone bd binary with km defaults
(repo root as cwd, BD_ACTOR from session context).

Native km commands:
  info      Show km+beads combined configuration and statistics
  where     Show km-specific paths
  config    View/modify km beads configuration (.km/config.yaml)
  migrate   Import from .beads/issues.jsonl to km markdown
  export    Export km issues to .beads/issues.jsonl

All other commands (list, show, create, update, close, ready, search,
query, dep, blocked, stale, children, epic, rename, sync, etc.)
proxy directly to bd. Run 'bd --help' for the full command reference.`,
  )
  .action(async (_opts, cmd) => {
    const args = cmd.args

    if (args.length === 0) {
      proxyToBd([])
      return
    }

    const subcommand = args[0]

    switch (subcommand) {
      // Tier 5: native km-specific commands
      case "info":
        await handleInfo(args.slice(1))
        return
      case "where":
        handleWhere(args.slice(1))
        return
      case "config":
        await configCommand.parseAsync(args.slice(1), { from: "user" })
        return
      case "migrate":
        await migrateCommand.parseAsync(args.slice(1), { from: "user" })
        return
      case "export":
        await exportCommand.parseAsync(args.slice(1), { from: "user" })
        return
      default:
        // Tier 1-4: proxy to bd binary
        proxyToBd(args)
    }
  })

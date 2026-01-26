/**
 * Rebuild Command
 *
 * Rebuild state.db from events.jsonl
 */

import createDebug from "debug"
import { Command } from "commander"
import chalk from "chalk"
import { steps } from "@beorn/inkx-ui/progress"
import { dirname, resolve } from "path"

const debug = createDebug("km:cli:rebuild")
import {
  rebuildState,
  fullReset,
  freshStart,
  getDbPath,
  getDb,
  getLastEventId,
  getEventsPath,
  findKmRootFromPath,
  runWithKmDir,
} from "@km/storage"
import { existsSync, statSync } from "fs"
import { formatPath } from "../utils/format-path.ts"

export const rebuildCommand = new Command("rebuild")
  .description("Rebuild state from events")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--full", "Full rebuild (delete and recreate state.db)")
  .option("--fresh", "Fresh start (delete all .km data including events)")
  .option("--status", "Show rebuild status only")
  .action(async (path, options) => {
    // Resolve repo path from argument or current directory
    const searchPath = path ? resolve(path) : process.cwd()
    const kmRoot = findKmRootFromPath(searchPath)

    if (!kmRoot) {
      console.error(
        chalk.red(`No .km directory found in ${searchPath} or ancestors.`),
      )
      console.error("Run 'km init' to initialize a repo.")
      process.exit(1)
    }

    // Run all operations in kmDir context
    debug("Using .km directory: %s", kmRoot)

    await runWithKmDir(kmRoot, async () => {
      if (options.status) {
        showStatus()
        return
      }

      if (options.fresh) {
        console.log(chalk.yellow("Fresh start - deleting all .km data..."))
        freshStart()
        console.log(
          chalk.green("✓"),
          "Fresh start complete - .km directory cleared",
        )
        return
      }

      const repoPath = dirname(kmRoot)
      debug("rebuild: starting (full=%s)", !!options.full)
      console.log(
        chalk.bold("Rebuilding .km/state.db from .km/events.jsonl"),
        chalk.dim(`(repo ${formatPath(repoPath)})`),
      )

      try {
        if (options.full) {
          console.log(chalk.dim("Performing full reset..."))
        }

        const results = await steps({
          rebuildState: options.full ? fullReset : rebuildState,
        }).run({ clear: true })

        const result = results.rebuildState as unknown as {
          duration: number
          eventCount: number
          nodeCount: number
        }

        debug(
          "rebuild: complete in %dms, events=%d nodes=%d",
          result.duration,
          result.eventCount,
          result.nodeCount,
        )

        console.log(chalk.green("✓"), "Rebuild complete")
        console.log(chalk.dim(`  Events: ${result.eventCount}`))
        console.log(chalk.dim(`  Nodes: ${result.nodeCount}`))
        console.log(chalk.dim(`  Time: ${result.duration}ms`))
      } catch (error) {
        console.error(chalk.red("Rebuild failed:"), error)
        process.exit(1)
      }
    })
  })

/**
 * Show rebuild status
 */
function showStatus(): void {
  const dbPath = getDbPath()
  const eventsPath = getEventsPath()

  console.log(chalk.bold("State Status"))
  console.log()

  // Database
  if (existsSync(dbPath)) {
    const stat = statSync(dbPath)
    console.log(chalk.dim("Database:"), dbPath)
    console.log(chalk.dim("  Size:"), formatSize(stat.size))
    console.log(chalk.dim("  Modified:"), new Date(stat.mtimeMs).toISOString())

    const lastEvent = getLastEventId(getDb())
    console.log(chalk.dim("  Last event:"), lastEvent?.slice(0, 13) ?? "(none)")
  } else {
    console.log(chalk.yellow("Database:"), "Not found")
  }

  console.log()

  // Events
  if (existsSync(eventsPath)) {
    const stat = statSync(eventsPath)
    console.log(chalk.dim("Events:"), eventsPath)
    console.log(chalk.dim("  Size:"), formatSize(stat.size))
    console.log(chalk.dim("  Modified:"), new Date(stat.mtimeMs).toISOString())
  } else {
    console.log(chalk.yellow("Events:"), "Not found")
  }
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

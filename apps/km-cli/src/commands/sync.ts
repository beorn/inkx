/**
 * Sync Command
 *
 * One-time sync between filesystem and database, or continuous watch mode
 */

import createDebug from "debug"
import { Command } from "commander"
import chalk from "chalk"
import { steps } from "@beorn/inkx-ui/progress"
import { Database } from "bun:sqlite"

const debug = createDebug("km:cli:sync")
import {
  SyncManager,
  findKmRootFromPath,
  runWithKmDir,
  syncState,
  getDb,
} from "@km/storage"
import { dirname, resolve } from "path"
import { formatPath } from "../utils/format-path.ts"

/**
 * Start the continuous filesystem watcher
 */
function startWatch(vaultPath: string, debounceMs: number, db: Database): void {
  debug("starting watch: %s (debounce=%dms)", vaultPath, debounceMs)
  console.log(chalk.dim(`Watching: ${vaultPath}`))
  console.log(chalk.dim(`Debounce: ${debounceMs}ms`))
  console.log(chalk.dim("Press Ctrl+C to stop\n"))

  const manager = new SyncManager({
    db,
    vaultPath,
    debounceFs: debounceMs,
    debounceApply: 3000,
    conflictStrategy: "last_write_wins",
  })

  manager.on("ready", () => {
    console.log(chalk.green("✓"), "Watcher ready")
  })

  manager.on("state-change", (state) => {
    console.log(chalk.dim(`State: ${state}`))
  })

  manager.on("write-complete", (data) => {
    console.log(
      chalk.green("✓"),
      `Wrote ${data.count} file(s)`,
      data.errors > 0 ? chalk.red(`(${data.errors} error(s))`) : "",
    )
  })

  manager.on("write-errors", (errors) => {
    for (const { path, error } of errors) {
      console.error(chalk.red("✗"), path, error.message)
    }
  })

  manager.on("error", (error) => {
    console.error(chalk.red("Error:"), error)
  })

  // Start watching
  manager.start()

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log(chalk.dim("\nStopping watcher..."))
    void (async () => {
      await manager.stop()
      process.exit(0)
    })()
  })

  process.on("SIGTERM", () => {
    void (async () => {
      await manager.stop()
      process.exit(0)
    })()
  })
}

/**
 * Perform a one-time sync operation
 */
async function runSync(
  vaultPath: string,
  kmRoot: string,
  options: { toFs?: boolean; dryRun?: boolean },
  db: Database,
): Promise<void> {
  debug("runSync", { vaultPath, toFs: options.toFs, dryRun: options.dryRun })
  console.log(
    chalk.bold(`Syncing .km/state.db with files`),
    chalk.dim(`(repo ${formatPath(vaultPath)})`),
  )

  if (options.dryRun) {
    console.log(chalk.yellow("Dry run mode - no changes will be made"))
    // TODO: Implement dry run
    return
  }

  // Run sync operations in kmDir context
  await runWithKmDir(kmRoot, async () => {
    try {
      // Step 1: Apply any pending events from events.jsonl to state.db
      const eventResults = await steps({
        syncState,
      }).run({ clear: true })

      const eventResult = eventResults.syncState as unknown as {
        applied: number
      }
      if (eventResult.applied > 0) {
        console.log(
          chalk.green("✓"),
          `Applied ${eventResult.applied} event(s) from events.jsonl`,
        )
      }

      // Step 2: Sync with filesystem
      const manager = new SyncManager({
        db,
        vaultPath,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "last_write_wins",
      })

      if (options.toFs) {
        console.log(chalk.dim("Syncing database → filesystem..."))
        const result = await manager.syncToFs()
        console.log(chalk.green("✓"), `Wrote ${result.written} file(s)`)
      } else {
        // Default: from filesystem
        const syncResults = await steps({
          syncFromFs: () => manager.syncFromFs(),
        }).run({ clear: true })

        const result = syncResults.syncFromFs as {
          processed: number
          directories: number
          duration: number
        }
        console.log(
          chalk.green("✓"),
          `Synced ${result.processed} change(s) in ${result.directories} directories (${result.duration}ms)`,
        )
      }
    } catch (error) {
      console.error(chalk.red("Sync failed:"), error)
      process.exit(1)
    }
  })
}

export const syncCommand = new Command("sync")
  .description("Sync filesystem with database (use --watch for continuous)")
  .argument("[path]", "Path to sync (default: vault root)")
  .option("--from-fs", "Sync from filesystem to database")
  .option("--to-fs", "Sync from database to filesystem")
  .option("--dry-run", "Show what would be synced without making changes")
  .option("-w, --watch", "Watch for filesystem changes continuously")
  .option(
    "--debounce <ms>",
    "Debounce interval in ms (only with --watch)",
    "5000",
  )
  .action(async (path, options) => {
    // Resolve vault path from argument or current directory
    const searchPath = path ? resolve(path) : process.cwd()
    const kmRoot = findKmRootFromPath(searchPath)

    if (!kmRoot) {
      console.error(`No .km directory found in ${searchPath} or ancestors.`)
      console.error("Run 'km init' to initialize a vault.")
      process.exit(1)
    }

    const vaultPath = dirname(kmRoot)
    debug("resolved vault path: %s (from kmRoot: %s)", vaultPath, kmRoot)

    // Get database instance (needed by SyncManager)
    // Note: getDb() is deprecated, but SyncManager requires a Database object.
    // TODO: Refactor to use Vault domain object when that API is available
    const db = getDb()

    if (options.watch) {
      const debounceMs = parseInt(options.debounce, 10)
      startWatch(vaultPath, debounceMs, db)
    } else {
      await runSync(vaultPath, kmRoot, options, db)
    }
  })

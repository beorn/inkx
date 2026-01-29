/**
 * Sync Command
 *
 * One-time sync between filesystem and database, or continuous watch mode
 */

import createDebug from "debug"
import { Command } from "@commander-js/extra-typings"
import { createTerm } from "@beorn/chalkx"

const term = createTerm(process)
import { steps } from "@beorn/inkx-ui/progress"
import { Database } from "bun:sqlite"
import { dirname, resolve, join } from "path"

const debug = createDebug("km:cli:sync")
import {
  SyncManager,
  findKmRootFromPath,
  syncState,
  SCHEMA,
  migrateToRepoRootNode,
} from "@km/storage"
import { runWithKmDir } from "@km/storage/internal/emit.ts"
import { formatPath } from "../utils/format-path.ts"

/**
 * Start the continuous filesystem watcher
 */
function startWatch(repoPath: string, debounceMs: number, db: Database): void {
  debug("starting watch: %s (debounce=%dms)", repoPath, debounceMs)
  console.log(term.style().dim(`Watching: ${repoPath}`))
  console.log(term.style().dim(`Debounce: ${debounceMs}ms`))
  console.log(term.style().dim("Press Ctrl+C to stop\n"))

  const manager = new SyncManager({
    db,
    repoPath,
    debounceFs: debounceMs,
    debounceApply: 3000,
    conflictStrategy: "last_write_wins",
  })

  manager.on("ready", () => {
    console.log(term.style().green("✓"), "Watcher ready")
  })

  manager.on("state-change", (state) => {
    console.log(term.style().dim(`State: ${state}`))
  })

  manager.on("write-complete", (data) => {
    /* eslint-disable @typescript-eslint/no-unsafe-member-access -- EventEmitter data payload is untyped */
    console.log(
      term.style().green("✓"),
      `Wrote ${data.count} file(s)`,
      data.errors > 0 ? term.style().red(`(${data.errors} error(s))`) : "",
    )
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  })

  manager.on("write-errors", (errors) => {
    for (const { path, error } of errors) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- EventEmitter error payload is untyped
      console.error(term.style().red("✗"), path, error.message)
    }
  })

  manager.on("error", (error) => {
    console.error(term.style().red("Error:"), error)
  })

  // Start watching
  manager.start()

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log(term.style().dim("\nStopping watcher..."))
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
  repoPath: string,
  kmRoot: string,
  options: { toFs?: boolean; dryRun?: boolean },
  db: Database,
): Promise<void> {
  debug("runSync", { repoPath, toFs: options.toFs, dryRun: options.dryRun })
  console.log(
    term.style().bold(`Syncing .km/state.db with files`),
    term.style().dim(`(repo ${formatPath(repoPath)})`),
  )

  if (options.dryRun) {
    console.log(term.style().yellow("Dry run mode - no changes will be made"))
    // TODO: Implement dry run
    return
  }

  // Run sync operations in kmDir context
  await runWithKmDir(kmRoot, async () => {
    try {
      // Step 1: Apply any pending events from events.jsonl to state.db
      // Pass db and kmDir explicitly to avoid singletons (ADR-002)
      const eventResults = await steps({
        syncState: function* () {
          return yield* syncState({ kmDir: kmRoot, db })
        },
      }).run({ clear: true })

      const eventResult = eventResults.syncState as unknown as {
        applied: number
      }
      if (eventResult.applied > 0) {
        console.log(
          term.style().green("✓"),
          `Applied ${eventResult.applied} event(s) from events.jsonl`,
        )
      }

      // Step 2: Sync with filesystem
      const manager = new SyncManager({
        db,
        repoPath,
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "last_write_wins",
      })

      if (options.toFs) {
        console.log(term.style().dim("Syncing database → filesystem..."))
        const result = await manager.syncToFs()
        console.log(term.style().green("✓"), `Wrote ${result.written} file(s)`)
      } else {
        // Default: from filesystem
        const syncResults = await steps({
          syncFromFs: () => manager.syncFromFsWithProgress(),
        }).run({ clear: true })

        const result = syncResults.syncFromFs as {
          processed: number
          directories: number
          duration: number
        }
        console.log(
          term.style().green("✓"),
          `Synced ${result.processed} change(s) in ${result.directories} directories (${result.duration}ms)`,
        )

        // Re-run migration after sync to catch any new orphan files
        // Files discovered during sync have parent_id = null, so we need to update them
        migrateToRepoRootNode(db, repoPath)
      }
    } catch (error) {
      console.error(term.style().red("Sync failed:"), error)
      process.exit(1)
    }
  })
}

export const syncCommand = new Command("sync")
  .description("Sync filesystem with database (use --watch for continuous)")
  .argument("[path]", "Path to sync (default: repo root)")
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
    // Resolve repo path from argument or current directory
    const searchPath = path ? resolve(path) : process.cwd()
    const kmRoot = findKmRootFromPath(searchPath)

    if (!kmRoot) {
      console.error(`No .km directory found in ${searchPath} or ancestors.`)
      console.error("Run 'km init' to initialize a repo.")
      process.exit(1)
    }

    const repoPath = dirname(kmRoot)
    debug("resolved repo path: %s (from kmRoot: %s)", repoPath, kmRoot)

    // Open database directly from kmRoot and ensure schema exists
    const db = new Database(join(kmRoot, "state.db"))
    db.run(SCHEMA)

    // Ensure repo root folder node exists (migration)
    migrateToRepoRootNode(db, repoPath)

    if (options.watch) {
      const debounceMs = parseInt(options.debounce, 10)
      startWatch(repoPath, debounceMs, db)
    } else {
      await runSync(repoPath, kmRoot, options, db)
    }
  })

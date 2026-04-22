/**
 * Sync Command
 *
 * One-time sync between filesystem and database, or continuous watch mode
 */

import { createLogger } from "loggily"
import { Command, uint } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import type { FullLogger } from "../logger-types.ts"

const term = createTerm(process)
import { steps } from "@silvery/ag-react/ui/progress"
import { Database } from "bun:sqlite"
import { dirname, resolve, join } from "path"

const log = createLogger("km:cli:sync") as FullLogger
import { createEmitter, readChanges, SCHEMA, ensureRepoRootNode } from "@km/storage"
import { withSync } from "@km/fs-mount"
import { type SyncableRepo, findKmRootFromPath } from "@km/fs-mount"
import { formatPath } from "../utils/format-path.ts"

// ============================================
// Main Export - Sync Command
// ============================================

export const syncCommand = new Command("sync")
  .description("Sync filesystem with database (use --watch for continuous)")
  .argument("[path]", "Path to sync (default: repo root)")
  .option("--from-fs", "Sync from filesystem to database")
  .option("--to-fs", "Sync from database to filesystem")
  .option("--dry-run", "Show what would be synced without making changes")
  .option("-w, --watch", "Watch for filesystem changes continuously")
  .option("--debounce <ms>", "Debounce interval in ms (only with --watch)", uint, 5000)
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
    log.debug?.(`resolved repo path: ${repoPath} (from kmRoot: ${kmRoot})`)

    // Open database directly from kmRoot and ensure schema exists
    const db = new Database(join(kmRoot, "state.db"))
    db.run(SCHEMA)

    // Ensure repo root folder node exists
    ensureRepoRootNode(db, repoPath)

    if (options.watch) {
      startWatch(repoPath, options.debounce ?? 5000, db)
    } else {
      await runSync(repoPath, kmRoot, options, db)
    }
  })

// ============================================
// Helper Functions
// ============================================

/** Build a minimal SyncableRepo from db + repoPath (for CLI commands without a full Repo) */
function buildSyncableRepo(db: Database, repoPath: string): SyncableRepo {
  const emitter = createEmitter({ kmDir: join(repoPath, ".km"), db })
  return {
    database: db,
    path: repoPath,
    emitter,
    apply(event, options?) {
      return emitter.apply(event, options)
    },
    commit(event, options?) {
      return emitter.commit(event, options)
    },
  }
}

/**
 * Start the continuous filesystem watcher
 */
function startWatch(repoPath: string, debounceMs: number, db: Database): void {
  log.debug?.(`starting watch: ${repoPath} (debounce=${debounceMs}ms)`)
  console.log(term.dim(`Watching: ${repoPath}`))
  console.log(term.dim(`Debounce: ${debounceMs}ms`))
  console.log(term.dim("Press Ctrl+C to stop\n"))

  const repo = buildSyncableRepo(db, repoPath)
  const manager = withSync({
    debounceFs: debounceMs,
    debounceApply: 3000,
    conflictStrategy: "last_write_wins",
    callbacks: {
      onReady: () => {
        console.log(term.green("✓"), "Watcher ready")
      },
      onStateChange: (state) => {
        console.log(term.dim(`State: ${state}`))
      },
      onWriteComplete: (data) => {
        console.log(
          term.green("✓"),
          `Wrote ${data.count} file(s)`,
          data.errors > 0 ? term.red(`(${data.errors} error(s))`) : "",
        )
      },
      onWriteErrors: (errors) => {
        for (const { path, error } of errors) {
          console.error(term.red("✗"), path, error.message)
        }
      },
      onError: (error) => {
        console.error(term.red("Error:"), error)
      },
    },
  })(repo)

  // Start watching
  manager.start()

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log(term.dim("\nStopping watcher..."))
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
  log.debug?.("runSync", {
    repoPath,
    toFs: options.toFs,
    dryRun: options.dryRun,
  })
  console.log(term.bold(`Syncing .km/state.db with files`), term.dim(`(repo ${formatPath(repoPath)})`))

  if (options.dryRun) {
    console.log(term.yellow("Dry run mode - no changes will be made"))
    // TODO: Implement dry run
    return
  }

  try {
    // Step 1: Apply any pending events from changes.jsonl to state.db
    const events = readChanges(kmRoot)
    const lastApplied = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event") as
      | { value: string }
      | undefined
    const newEvents = events.filter((e) => !lastApplied?.value || e.id > lastApplied.value)

    if (newEvents.length > 0) {
      const { applyChangeWithDb } = await import("@km/storage")
      db.run("BEGIN IMMEDIATE")
      try {
        for (const event of newEvents) {
          applyChangeWithDb(db, event)
        }
        db.run("COMMIT")
      } catch (error) {
        db.run("ROLLBACK")
        throw error
      }
      console.log(term.green("✓"), `Applied ${newEvents.length} event(s) from changes.jsonl`)
    }

    // Step 2: Sync with filesystem
    const repo = buildSyncableRepo(db, repoPath)
    const manager = withSync({
      debounceFs: 0,
      debounceApply: 0,
      conflictStrategy: "last_write_wins",
    })(repo)

    if (options.toFs) {
      console.log(term.dim("Syncing database → filesystem..."))
      const result = await manager.syncToFs()
      console.log(term.green("✓"), `Wrote ${result.written} file(s)`)
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
        term.green("✓"),
        `Synced ${result.processed} change(s) in ${result.directories} directories (${result.duration}ms)`,
      )

      // Ensure repo root exists after sync
      ensureRepoRootNode(db, repoPath)
    }
  } catch (error) {
    console.error(term.red("Sync failed:"), error)
    process.exit(1)
  }
}

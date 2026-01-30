/**
 * Rebuild Command
 *
 * Rebuild state.db from events.jsonl
 */

import createDebug from "debug"
import { Command } from "@commander-js/extra-typings"
import { createTerm } from "inkx"

const term = createTerm(process)
import { steps } from "@beorn/inkx-ui/progress"
import { dirname, resolve } from "path"

const debug = createDebug("km:cli:rebuild")
import {
  rebuildState,
  fullReset,
  freshStart,
  getLastEventId,
  findKmRootFromPath,
  SCHEMA,
} from "@km/storage"
import { Database } from "bun:sqlite"
import { existsSync, statSync } from "fs"
import { join } from "path"
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
        term.red(`No .km directory found in ${searchPath} or ancestors.`),
      )
      console.error("Run 'km init' to initialize a repo.")
      process.exit(1)
    }

    debug("Using .km directory: %s", kmRoot)

    if (options.status) {
      showStatus(kmRoot)
      return
    }

    if (options.fresh) {
      console.log(term.yellow("Fresh start - deleting all .km data..."))
      freshStart(kmRoot)
      console.log(
        term.green("✓"),
        "Fresh start complete - .km directory cleared",
      )
      return
    }

    const repoPath = dirname(kmRoot)
    debug("rebuild: starting (full=%s)", !!options.full)
    console.log(
      term.bold("Rebuilding .km/state.db from .km/events.jsonl"),
      term.dim(`(repo ${formatPath(repoPath)})`),
    )

    // Open database for rebuild operations
    const db = new Database(join(kmRoot, "state.db"))
    db.run(SCHEMA)

    try {
      if (options.full) {
        console.log(term.dim("Performing full reset..."))
      }

      const results = await steps({
        rebuildState: options.full
          ? function* () {
              return yield* fullReset(kmRoot, db)
            }
          : function* () {
              return yield* rebuildState(kmRoot, db)
            },
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

      console.log(term.green("✓"), "Rebuild complete")
      console.log(term.dim(`  Events: ${result.eventCount}`))
      console.log(term.dim(`  Nodes: ${result.nodeCount}`))
      console.log(term.dim(`  Time: ${result.duration}ms`))
    } catch (error) {
      console.error(term.red("Rebuild failed:"), error)
      process.exit(1)
    } finally {
      db.close()
    }
  })

/**
 * Show rebuild status
 */
function showStatus(kmRoot: string): void {
  const dbPath = join(kmRoot, "state.db")
  const eventsPath = join(kmRoot, "events.jsonl")

  console.log(term.bold("State Status"))
  console.log()

  // Database
  if (existsSync(dbPath)) {
    const stat = statSync(dbPath)
    console.log(term.dim("Database:"), dbPath)
    console.log(term.dim("  Size:"), formatSize(stat.size))
    console.log(term.dim("  Modified:"), new Date(stat.mtimeMs).toISOString())

    const db = new Database(dbPath, { readonly: true })
    const lastEvent = getLastEventId(db)
    db.close()
    console.log(term.dim("  Last event:"), lastEvent?.slice(0, 13) ?? "(none)")
  } else {
    console.log(term.yellow("Database:"), "Not found")
  }

  console.log()

  // Events
  if (existsSync(eventsPath)) {
    const stat = statSync(eventsPath)
    console.log(term.dim("Events:"), eventsPath)
    console.log(term.dim("  Size:"), formatSize(stat.size))
    console.log(term.dim("  Modified:"), new Date(stat.mtimeMs).toISOString())
  } else {
    console.log(term.yellow("Events:"), "Not found")
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

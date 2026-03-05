/**
 * Doctor Command
 *
 * Diagnose and repair km stores (worktree, events.jsonl, state.db).
 * Replaces the old rebuild command with a structured set of subcommands.
 */

import { createLogger } from "decant"
import { Command } from "@commander-js/extra-typings"
import { createTerm } from "@hightea/term"

const term = createTerm(process)

import { steps } from "@beorn/inkx-ui/progress"
import { dirname, join, resolve } from "path"

const log = createLogger("km:cli:doctor")

import { Database } from "bun:sqlite"
import {
  compactEvents,
  createRepo,
  findKmRootFromPath,
  getStoreHealth,
  parseDeferredAsync,
  type Repo,
  vacuumDb,
} from "@km/storage"
import { existsSync, unlinkSync } from "fs"
import { formatPath } from "../utils/format-path.ts"

// ============================================
// Subcommands
// ============================================

const doctorGcCommand = new Command("gc")
  .description("Compact stale events and vacuum database")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--dry-run", "Show what would be compacted without changing files")
  .action(async (path, options) => {
    const { kmDir, repoPath } = resolveKmDir(path)
    const dbPath = join(kmDir, "state.db")

    console.log(term.bold("km doctor gc"), term.dim(`(repo ${formatPath(repoPath)})`))

    if (!existsSync(dbPath)) {
      console.error(term.red("No state.db found. Run 'km doctor rebuild' first."))
      process.exit(1)
    }

    const db = options.dryRun ? new Database(dbPath, { readonly: true }) : new Database(dbPath)

    try {
      // Compact events
      const eventsPath = join(kmDir, "events.jsonl")
      if (existsSync(eventsPath)) {
        if (options.dryRun) {
          // Use identifyStaleEvents for dry run
          const { identifyStaleEvents } = await import("@km/storage")
          const result = identifyStaleEvents(kmDir, db)
          if (result.staleCount > 0) {
            console.log(
              `  events.jsonl  ${result.totalEvents} → ${result.totalEvents - result.staleCount} events ` +
                term.dim(`(would remove ${result.staleCount} stale)`),
            )
          } else {
            console.log(`  events.jsonl  ${result.totalEvents} events`, term.dim("(no stale events)"))
          }
          console.log(term.dim("  state.db      VACUUM (dry run, skipped)"))
          return
        }

        const start = performance.now()
        const result = compactEvents(kmDir, db)
        if (result.staleCount > 0) {
          console.log(
            `  events.jsonl  ${result.totalEvents} → ${result.totalEvents - result.staleCount} events ` +
              term.dim(`(removed ${result.staleCount} stale)`),
          )
        } else {
          console.log(`  events.jsonl  ${result.totalEvents} events`, term.dim("(no stale events)"))
        }

        // Vacuum
        const saved = vacuumDb(kmDir)
        if (saved > 0) {
          console.log(`  state.db      VACUUM saved ${formatSize(saved)}`)
        } else {
          console.log(`  state.db      VACUUM`, term.dim("(no space reclaimed)"))
        }

        const elapsed = Math.round(performance.now() - start)
        console.log(term.green("✓"), `Compacted in ${elapsed}ms`)
      } else {
        console.log(term.dim("  No events.jsonl found, nothing to compact"))
      }
    } finally {
      db.close()
    }
  })

const doctorRebuildCommand = new Command("rebuild")
  .description("Rebuild state.db from events and worktree")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--dry-run", "Show what would be rebuilt without changing files")
  .action(async (path, options) => {
    const { kmDir, repoPath } = resolveKmDir(path)

    console.log(term.bold("km doctor rebuild"), term.dim(`(repo ${formatPath(repoPath)})`))

    if (options.dryRun) {
      const dbPath = join(kmDir, "state.db")
      console.log(`  Would delete: ${dbPath}`)
      console.log(`  Would rebuild from events.jsonl + worktree`)
      return
    }

    log.debug?.(`rebuild: starting`)

    // Delete state.db files before rebuild
    const dbPath = join(kmDir, "state.db")
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = dbPath + suffix
      if (existsSync(p)) unlinkSync(p)
    }

    await loadAndReport(repoPath, "rebuildState", "Rebuild complete")
  })

const doctorResetCommand = new Command("reset")
  .description("Reset from worktree only (deletes events.jsonl + state.db)")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--dry-run", "Show what would be reset without changing files")
  .action(async (path, options) => {
    const { kmDir, repoPath } = resolveKmDir(path)

    console.log(term.bold("km doctor reset"), term.dim(`(repo ${formatPath(repoPath)})`))

    const targets = ["events.jsonl", "state.db", "state.db-wal", "state.db-shm"]
    const toDelete = targets.map((f) => join(kmDir, f)).filter((p) => existsSync(p))

    if (options.dryRun) {
      if (toDelete.length > 0) {
        console.log("  Would delete:")
        for (const p of toDelete) {
          console.log(`    ${p}`)
        }
      } else {
        console.log("  Nothing to delete (already clean)")
      }
      console.log("  Would re-sync from worktree files")
      return
    }

    // Delete events.jsonl and state.db (preserve config/blobs)
    for (const p of toDelete) {
      unlinkSync(p)
      log.debug?.(`deleted: ${p}`)
    }

    if (toDelete.length > 0) {
      console.log(term.dim(`  Deleted ${toDelete.length} file(s)`))
    }

    await loadAndReport(repoPath, "syncFromWorktree", "Reset complete")
  })

// ============================================
// Main Doctor Command
// ============================================

export const doctorCommand = new Command("doctor")
  .description("Diagnose and repair km stores")
  .argument("[path]", "Path to repo (default: current directory)")
  .addCommand(doctorGcCommand)
  .addCommand(doctorRebuildCommand)
  .addCommand(doctorResetCommand)
  .action((path) => {
    const { kmDir, repoPath } = resolveKmDir(path)

    console.log(term.bold("km doctor"), term.dim(`(repo ${formatPath(repoPath)})`))
    console.log()

    const dbPath = join(kmDir, "state.db")
    const db = existsSync(dbPath) ? new Database(dbPath, { readonly: true }) : null

    try {
      const health = getStoreHealth(repoPath, kmDir, db)

      // Worktree
      console.log(`  Worktree       ${health.worktree.fileCount} files, ${health.worktree.dirCount} directories`)

      // Events
      if (health.events) {
        const staleInfo = health.events.staleCount > 0 ? ` (${health.events.staleCount} stale)` : ""
        console.log(`  events.jsonl   ${health.events.count} events${staleInfo}, ${formatSize(health.events.size)}`)
      } else {
        console.log(`  events.jsonl   ${term.dim("(not found)")}`)
      }

      // Database
      if (health.db) {
        console.log(`  state.db       ${health.db.nodeCount.toLocaleString()} nodes, ${formatSize(health.db.size)}`)
      } else {
        console.log(`  state.db       ${term.dim("(not found)")}`)
      }

      // Issues
      if (health.issues.length > 0) {
        console.log()
        console.log("  Issues:")
        for (const issue of health.issues) {
          console.log(`    ⚠ ${issue}`)
        }
      } else {
        console.log()
        console.log(term.green("  ✓ All stores healthy"))
      }
    } finally {
      db?.close()
    }
  })

// ============================================
// Helpers
// ============================================

async function loadAndReport(repoPath: string, stepLabel: string, successMessage: string): Promise<void> {
  try {
    // Don't use `using` — we need the repo alive for deferred file parsing
    let repo!: Repo
    await steps({
      [stepLabel]: function* () {
        repo = yield* createRepo(repoPath, { loadFiles: true })
        return {
          nodeCount: repo.stats.nodeCount,
          duration: repo.stats.duration,
        }
      },
    }).run({ clear: true })

    // Parse deferred files (reconciliation stubs that need markdown parsing)
    if (repo.deferredFiles.length > 0) {
      console.log(term.dim(`  Parsing ${repo.deferredFiles.length} new files...`))
      await parseDeferredAsync(repo.database, repo.deferredFiles)
    }

    const nodeCount = (
      repo.database.prepare("SELECT COUNT(*) as count FROM nodes").get() as {
        count: number
      }
    ).count
    repo.close()

    console.log(term.green("✓"), successMessage)
    console.log(term.dim(`  Nodes: ${nodeCount}`))
    console.log(term.dim(`  Time: ${repo.stats.duration}ms`))
  } catch (error) {
    console.error(term.red(`${successMessage.split(" ")[0]} failed:`), error)
    process.exit(1)
  }
}

function resolveKmDir(path?: string): { kmDir: string; repoPath: string } {
  const searchPath = path ? resolve(path) : process.cwd()
  const kmDir = findKmRootFromPath(searchPath)

  if (!kmDir) {
    console.error(term.red(`No .km directory found in ${searchPath} or ancestors.`))
    console.error("Run 'km init' to initialize a repo.")
    process.exit(1)
  }

  return { kmDir, repoPath: dirname(kmDir) }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Doctor Command
 *
 * Diagnose and repair km stores (worktree, changes.jsonl, state.db).
 * Replaces the old rebuild command with a structured set of subcommands.
 */

import { createLogger } from "loggily"
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)

import { steps } from "@silvery/ag-react/ui/progress"
import { dirname, join, resolve } from "path"

const log = createLogger("km:cli:doctor")

import { Database } from "bun:sqlite"
import {
  compactChanges,
  compactJournal,
  createRepo,
  getStoreHealth,
  parseDeferredAsync,
  type Repo,
  vacuumDb,
} from "@km/storage"
import { findKmRootFromPath } from "@km/fs-mount"
import { existsSync, statSync, unlinkSync } from "fs"
import { formatPath } from "../utils/format-path.ts"
import { getBrokenLinks, getBrokenLinkCount, printBrokenLinks } from "./broken-links.ts"
import { findPathDrift, countPathDriftCheckable } from "./doctor-paths-check.ts"

// ============================================
// Subcommands
// ============================================

const doctorGcCommand = new Command("gc")
  .description("Compact stale events and vacuum database")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--dry-run", "Show what would be compacted without changing files")
  .option("--truncate", "Drop the applied prefix of changes.jsonl (snapshot-based compaction)")
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
      const changesPath = join(kmDir, "changes.jsonl")
      if (existsSync(changesPath)) {
        if (options.dryRun) {
          // Use identifyStaleChanges for dry run
          const { identifyStaleChanges } = await import("@km/storage")
          const result = identifyStaleChanges(kmDir, db)
          if (result.staleCount > 0) {
            console.log(
              `  changes.jsonl  ${result.totalChanges} → ${result.totalChanges - result.staleCount} events ` +
                term.dim(`(would remove ${result.staleCount} stale)`),
            )
          } else {
            console.log(`  changes.jsonl  ${result.totalChanges} events`, term.dim("(no stale events)"))
          }
          if (options.truncate) {
            const sizeBefore = statSync(changesPath).size
            const offsetRow = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_event_offset") as
              | { value: string }
              | undefined
            const cursor = offsetRow ? Number(offsetRow.value) : 0
            const tailBytes = Math.max(0, sizeBefore - cursor)
            console.log(
              term.dim(
                `  --truncate    would drop applied prefix (${formatSize(cursor)}), keep tail (${formatSize(tailBytes)})`,
              ),
            )
          }
          console.log(term.dim("  state.db      VACUUM (dry run, skipped)"))
          return
        }

        const start = performance.now()

        if (options.truncate) {
          const before = compactJournal(kmDir, db)
          if (before.truncated) {
            console.log(
              `  changes.jsonl  ${formatSize(before.bytesBefore)} → ${formatSize(before.bytesAfter)} ` +
                term.dim(`(truncated applied prefix, reclaimed ${formatSize(before.bytesReclaimed)})`),
            )
          } else {
            console.log(`  changes.jsonl  ${formatSize(before.bytesBefore)}`, term.dim("(nothing to truncate)"))
          }
        } else {
          const result = compactChanges(kmDir, db)
          if (result.staleCount > 0) {
            console.log(
              `  changes.jsonl  ${result.totalChanges} → ${result.totalChanges - result.staleCount} events ` +
                term.dim(`(removed ${result.staleCount} stale)`),
            )
          } else {
            console.log(`  changes.jsonl  ${result.totalChanges} events`, term.dim("(no stale events)"))
          }
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
        console.log(term.dim("  No changes.jsonl found, nothing to compact"))
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
      console.log(`  Would rebuild from changes.jsonl + worktree`)
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
  .description("Reset from worktree only (deletes changes.jsonl + state.db)")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--dry-run", "Show what would be reset without changing files")
  .action(async (path, options) => {
    const { kmDir, repoPath } = resolveKmDir(path)

    console.log(term.bold("km doctor reset"), term.dim(`(repo ${formatPath(repoPath)})`))

    const targets = ["changes.jsonl", "state.db", "state.db-wal", "state.db-shm"]
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

    // Delete changes.jsonl and state.db (preserve config/blobs)
    for (const p of toDelete) {
      unlinkSync(p)
      log.debug?.(`deleted: ${p}`)
    }

    if (toDelete.length > 0) {
      console.log(term.dim(`  Deleted ${toDelete.length} file(s)`))
    }

    await loadAndReport(repoPath, "syncFromWorktree", "Reset complete")
  })

// `km doctor integrity` scans the node table for structural corruption that
// bypasses the normal write path — specifically, fs-backed nodes (file,
// mdfile, folder) whose parent_id points to a non-folder. This catches the
// km-tui.cursor-in-columns-crash class of bug where an unvalidated
// node_moved event reparented a file into an mdsection and tripped every
// downstream cursor invariant. With `--repair`, rows are re-parented to
// the folder derived from fs_path.
interface FsParentMismatchRow {
  id: string
  fs_path: string | null
  parent_id: string | null
  fstype: string | null
  parent_fstype: string | null
}

function findFsParentMismatches(db: Database): FsParentMismatchRow[] {
  return db
    .query(
      `SELECT n.id, n.fs_path, n.parent_id, n.fstype, p.fstype AS parent_fstype
       FROM nodes n
       LEFT JOIN nodes p ON p.id = n.parent_id
       WHERE n.fstype IN ('file','mdfile','folder')
         AND n.id != '.'
         AND (p.fstype IS NULL OR p.fstype != 'folder')`,
    )
    .all() as FsParentMismatchRow[]
}

const doctorIntegrityCommand = new Command("integrity")
  .description("Detect (and optionally repair) fs-parent corruption in the node table")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--repair", "Re-parent corrupt rows using dirname(fs_path)")
  .action((path, options) => {
    const { kmDir, repoPath } = resolveKmDir(path)
    const dbPath = join(kmDir, "state.db")

    console.log(term.bold("km doctor integrity"), term.dim(`(repo ${formatPath(repoPath)})`))

    if (!existsSync(dbPath)) {
      console.error(term.red("No state.db found. Run 'km doctor rebuild' first."))
      process.exit(1)
    }

    const db = options.repair ? new Database(dbPath) : new Database(dbPath, { readonly: true })
    try {
      const rows = findFsParentMismatches(db)
      if (rows.length === 0) {
        console.log(term.green("  ✓ No fs-parent mismatches"))
        return
      }

      console.log(term.yellow(`  Found ${rows.length} corrupt row(s):`))
      for (const row of rows) {
        console.log(
          `    ${row.fstype ?? "?"} ${term.dim(row.id)} → parent fstype=${row.parent_fstype ?? "null"} (expected folder)`,
        )
      }

      if (!options.repair) {
        console.log()
        console.log(term.dim("  Run 'km doctor integrity --repair' to fix these rows."))
        return
      }

      // Repair: derive the correct parent from fs_path. The correct parent
      // is the folder node whose fs_path equals dirname(fs_path). If that
      // folder doesn't exist as a node, we can't confidently repair — leave
      // it and warn.
      let repaired = 0
      for (const row of rows) {
        if (!row.fs_path) {
          console.log(term.yellow(`    ${row.id}: no fs_path, cannot repair`))
          continue
        }
        const lastSlash = row.fs_path.lastIndexOf("/")
        const parentPath = lastSlash === -1 ? "." : row.fs_path.slice(0, lastSlash)
        const parentRow = db
          .query("SELECT id, fstype FROM nodes WHERE fs_path = ? OR id = ?")
          .get(parentPath, parentPath) as { id: string; fstype: string | null } | null
        if (parentRow?.fstype !== "folder") {
          console.log(term.yellow(`    ${row.id}: expected parent '${parentPath}' not found as folder, cannot repair`))
          continue
        }
        db.run("UPDATE nodes SET parent_id = ?, updated_at = ? WHERE id = ?", [parentRow.id, Date.now(), row.id])
        repaired++
      }
      console.log()
      console.log(term.green(`  ✓ Repaired ${repaired}/${rows.length} row(s)`))
      if (repaired < rows.length) {
        console.log(term.dim("  Unrepaired rows need manual inspection or a rebuild (`km doctor rebuild`)."))
      }
    } finally {
      db.close()
    }
  })

// `km doctor paths` is a soft sanity check: for every node carrying an
// `id` prop (in `data.id`), derive the path by walking the parent chain
// and joining `node.name` with "/". A drift between the declared id and
// the derived path means the file was likely moved or renamed without
// updating the `id` prop (or without `km bd rename`).
//
// Soft check: no enforcement, no derive-on-read doctrine — just surface
// the discrepancy so an operator can decide whether to fix the file or
// re-run a migration.
const doctorPathsCommand = new Command("paths")
  .description("Detect drift between data.id (id prop) and derived parent path")
  .argument("[path]", "Path to repo (default: current directory)")
  .option("--include-fixtures", "Scan test-fixture corpora (fidelity-corpus, __fixtures__, etc.) too")
  .action((path, options) => {
    const { kmDir, repoPath } = resolveKmDir(path)
    const dbPath = join(kmDir, "state.db")

    console.log(term.bold("km doctor paths"), term.dim(`(repo ${formatPath(repoPath)})`))

    if (!existsSync(dbPath)) {
      console.error(term.red("No state.db found. Run 'km doctor rebuild' first."))
      process.exit(1)
    }

    const db = new Database(dbPath, { readonly: true })
    try {
      const checked = countPathDriftCheckable(db)
      const findings = findPathDrift(db, { includeFixtures: options.includeFixtures })
      if (findings.length === 0) {
        console.log(term.green(`  ✓ No drift across ${checked} bead(s) with data.id`))
        return
      }
      console.log(term.yellow(`  Found ${findings.length} drift warning(s):`))
      for (const f of findings) {
        console.log(
          `    ${term.dim(f.nodeId)}: data.id (${term.bold(f.declared)}) ≠ derived (${term.bold(f.derived)}). ` +
            term.dim("File may have been moved without 'km bd rename'."),
        )
      }
      console.log()
      console.log(term.dim(`  Found ${findings.length} drift warning(s) out of ${checked} bead(s) checked.`))
    } finally {
      db.close()
    }
  })

// `km doctor links` is a convenience alias for `km list --broken`.
// Both paths call the same shared broken-links logic in ./broken-links.ts,
// so output stays in sync. The only difference is the header line.
const doctorLinksCommand = new Command("links")
  .description("Detect broken wikilinks (alias for `km list --broken`)")
  .argument("[path]", "Path to repo (default: current directory)")
  .action((path) => {
    const { kmDir, repoPath } = resolveKmDir(path)
    const dbPath = join(kmDir, "state.db")

    console.log(term.bold("km doctor links"), term.dim(`(repo ${formatPath(repoPath)})`))

    if (!existsSync(dbPath)) {
      console.error(term.red("No state.db found. Run 'km doctor rebuild' first."))
      process.exit(1)
    }

    const db = new Database(dbPath, { readonly: true })
    try {
      const brokenLinks = getBrokenLinks(db)
      printBrokenLinks(brokenLinks, term)
    } finally {
      db.close()
    }
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
  .addCommand(doctorIntegrityCommand)
  .addCommand(doctorLinksCommand)
  .addCommand(doctorPathsCommand)
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
      if (health.changes) {
        const staleInfo = health.changes.staleCount > 0 ? ` (${health.changes.staleCount} stale)` : ""
        console.log(`  changes.jsonl   ${health.changes.count} events${staleInfo}, ${formatSize(health.changes.size)}`)
      } else {
        console.log(`  changes.jsonl   ${term.dim("(not found)")}`)
      }

      // Database
      if (health.db) {
        console.log(`  state.db       ${health.db.nodeCount.toLocaleString()} nodes, ${formatSize(health.db.size)}`)
      } else {
        console.log(`  state.db       ${term.dim("(not found)")}`)
      }

      // Links
      if (db) {
        const brokenCount = getBrokenLinkCount(db)
        if (brokenCount > 0) {
          health.issues.push(`${brokenCount} broken wikilink(s)\n` + `      Run 'km doctor links' to see details`)
        }
        console.log(`  Links          ${brokenCount > 0 ? `${brokenCount} broken` : term.green("all resolved")}`)
      }

      // Integrity: fs-backed nodes parented to non-folders
      if (db) {
        const corrupt = findFsParentMismatches(db).length
        if (corrupt > 0) {
          health.issues.push(
            `${corrupt} fs-node(s) with non-folder parent\n` + `      Run 'km doctor integrity --repair' to fix`,
          )
        }
        console.log(`  Integrity      ${corrupt > 0 ? `${corrupt} corrupt fs-parent(s)` : term.green("clean")}`)
      }

      // Path drift: data.id ≠ derived parent path (file moved without `km bd rename`)
      if (db) {
        const drift = findPathDrift(db).length
        if (drift > 0) {
          health.issues.push(
            `${drift} bead(s) with data.id ≠ derived path\n` + `      Run 'km doctor paths' to see details`,
          )
        }
        console.log(`  Paths          ${drift > 0 ? `${drift} drift warning(s)` : term.green("aligned")}`)
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

    // Parse deferred files (reconciliation stubs that need markdown parsing).
    // Track imported / skipped / failed so the rebuild summary reflects what
    // actually landed in the DB instead of claiming success when N files were
    // silently dropped.
    let imported = 0
    let skipped = 0
    let failed: Array<{ fsPath: string; error: string }> = []
    if (repo.deferredFiles.length > 0) {
      console.log(term.dim(`  Parsing ${repo.deferredFiles.length} new files...`))
      const result = await parseDeferredAsync(repo.database, repo.deferredFiles)
      imported = result.parsed
      skipped = result.skipped
      failed = result.failed
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

    // Completeness summary: distinguish imported / skipped / failed so a
    // silent partial-rebuild can't masquerade as success. P0 motivation —
    // see km-beads.rebuild-completeness-plateau.
    if (repo.deferredFiles.length > 0) {
      const summary = `${imported} imported, ${skipped} skipped, ${failed.length} failed`
      if (failed.length > 0) {
        console.log(term.red(`  Rebuild incomplete: ${summary}`))
        console.log(term.red("  Failed files:"))
        for (const f of failed) {
          console.log(term.red(`    ${f.fsPath}`))
          console.log(term.dim(`      ${f.error}`))
        }
        console.log()
        console.log(
          term.dim("  Re-run after fixing the listed files. Set DEBUG=km:* DEBUG_LOG=/tmp/km.log for trace output."),
        )
        process.exit(1)
      } else {
        console.log(term.dim(`  Rebuild complete: ${summary}`))
      }
    }
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

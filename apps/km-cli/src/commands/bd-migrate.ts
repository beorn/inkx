/**
 * Beads Migration/Export Commands
 *
 * Commands for migrating between .beads/issues.jsonl and markdown formats.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import {
  queryIssues,
  findBeadsDir,
  getMigrationStats,
  migrateBeadsToMarkdown,
  exportToBeads,
  type BeadsFs,
} from "@km/beads"
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs"
import { join, dirname } from "node:path"
import { spawnSync } from "node:child_process"
import { getOriginalBeadsConfig } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadKmBdConfig } from "./bd-load-config.ts"

/** Real filesystem implementation for BeadsFs DI */
const nodeFs: BeadsFs = { existsSync, readFileSync, writeFileSync, mkdirSync }

/**
 * bd migrate - Migrate from .beads/issues.jsonl to markdown
 */
export const migrateCommand = new Command("migrate")
  .description("Migrate issues from .beads/issues.jsonl to markdown files")
  .option("--dry-run", "Show what would be migrated without writing files")
  .option("--status <statuses>", "Only migrate issues with these statuses (comma-separated)")
  .option("--target <dir>", "Target directory for markdown files")
  .option("--source <dir>", "Source .beads directory (or its parent). Defaults to auto-discovery upward from cwd.")
  .option("--file <path>", "Read issues directly from a .jsonl file (skips .beads discovery and pre-flight).")
  .option("--no-preflight", "Skip pre-flight: bd export refresh + bd doctor.")
  .action(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    // Source resolution: --file > --source > auto-discover. The migrate
    // helpers accept either a .beads dir or a direct .jsonl path; the CLI
    // surface mirrors that.
    const fileArg = opts.file as string | undefined
    const sourceArg = opts.source as string | undefined
    let migrateSource: string
    let beadsDir: string | undefined
    if (fileArg) {
      if (!nodeFs.existsSync(fileArg)) {
        console.error(term.red(`File not found: ${fileArg}`))
        process.exitCode = 1
        return
      }
      migrateSource = fileArg
      // Pretend the parent of the .jsonl is .beads so config + prefix
      // resolution still works when the file lives next to a config.yaml.
      const parent = dirname(fileArg)
      beadsDir = parent.endsWith(".beads") ? parent : undefined
    } else {
      const found = sourceArg
        ? sourceArg.endsWith("/.beads") || sourceArg.endsWith(".beads")
          ? sourceArg
          : join(sourceArg, ".beads")
        : findBeadsDir(nodeFs, resolved.repoRoot)
      if (!found || !nodeFs.existsSync(found)) {
        console.error(term.red(`No .beads directory found${sourceArg ? ` at ${found}` : ""}.`))
        console.log(term.dim("Pass --source <dir>, --file <path>, or run from a vault containing .beads/."))
        process.exitCode = 1
        return
      }
      beadsDir = found
      migrateSource = found
    }

    // Pre-flight (only when reading from a managed .beads dir): refresh
    // issues.jsonl from Dolt + run bd doctor so we don't migrate stale
    // or broken state. Skipped for --file (foreign import) and
    // --no-preflight (power users / CI).
    if (beadsDir && opts.preflight !== false) {
      runPreflight(beadsDir)
    }

    // Read original beads config for issue prefix
    const sourceRoot = sourceArg ?? (beadsDir ? dirname(beadsDir) : resolved.repoRoot)
    const originalConfig = getOriginalBeadsConfig(sourceRoot)
    const originalConfigPath = beadsDir && originalConfig ? join(beadsDir, "config.yaml") : undefined
    const sourcePrefix = (originalConfig?.["issue-prefix"] as string | undefined) ?? configObj.beads.prefix

    // Show stats first
    const stats = getMigrationStats(nodeFs, migrateSource)
    console.log(term.bold("Migration Source"))
    if (fileArg) {
      console.log(`  File: ${fileArg}`)
    } else {
      console.log(`  .beads dir: ${migrateSource}`)
    }
    if (originalConfigPath) {
      console.log(`  Original config: ${originalConfigPath}`)
      if (originalConfig?.["issue-prefix"]) {
        console.log(`  Issue prefix: ${originalConfig["issue-prefix"]}`)
      }
    }
    console.log(`  Total issues: ${stats.total}`)
    console.log(
      `  By status: ${Object.entries(stats.byStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    )
    console.log(
      `  By type: ${Object.entries(stats.byType)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    )
    console.log()

    if (stats.total === 0) {
      console.log(term.yellow("No issues to migrate."))
      return
    }

    // Determine target directory. Default = vault root: each issue lands
    // at <repoRoot>/<scope>/<slug>.md where scope = first segment of the
    // path-form id (e.g. km-beads.cutover → beads/cutover.md). The board
    // sigil is derived from scope per-issue inside issueToMarkdown — no
    // global board/parent config knob.
    const targetDir = opts.target || resolved.repoRoot

    // Parse status filter
    const statusFilter = opts.status ? opts.status.split(",") : undefined

    console.log(term.bold("Migration Target"))
    console.log(`  Target dir: ${targetDir}`)
    console.log(`  Board tag:  derived per-issue from scope (km-beads.X → @km/beads, km-silvery.Y → @km/silvery, …)`)
    if (statusFilter) {
      console.log(`  Status filter: ${statusFilter.join(", ")}`)
    }
    console.log()

    if (opts.dryRun) {
      console.log(term.yellow("Dry run - no files will be written."))
      console.log()
    }

    // Run migration
    const result = migrateBeadsToMarkdown(migrateSource, {
      targetDir,
      statusFilter,
      dryRun: opts.dryRun,
      fs: nodeFs,
      sourcePrefix,
    })

    console.log(term.bold("Results"))
    console.log(`  Migrated: ${result.migrated}`)
    console.log(`  Skipped (already exist): ${result.skipped}`)
    if (result.errors.length > 0) {
      console.log(term.red(`  Errors: ${result.errors.length}`))
      for (const err of result.errors) {
        console.log(term.red(`    - ${err}`))
      }
    }

    if (result.migrated > 0 && !opts.dryRun) {
      console.log()
      console.log(term.green(`✓ Migrated ${result.migrated} issues to ${targetDir}`))
      console.log(term.dim("Run 'km doctor rebuild' to index the new files."))
    }
  })

/**
 * bd export - Export km issues to .beads/issues.jsonl
 */
export const exportCommand = new Command("export")
  .description("Export km issues to .beads/issues.jsonl format")
  .option("--dry-run", "Show what would be exported without writing")
  .option("--mode <mode>", "Export mode: append or replace", "append")
  .option("--target <dir>", "Target .beads directory")
  .action(async (opts) => {
    const resolved = resolvePathArg(undefined)
    await loadKmBdConfig(resolved.repoRoot)

    // Get issues from km — no global board filter; scope is derived per-issue
    // from the canonical id, so every scope-tagged item is an issue.
    const issues = queryIssues({}, undefined, undefined)

    console.log(term.bold("Export Source"))
    console.log(`  km issues: ${issues.length}`)
    console.log()

    if (issues.length === 0) {
      console.log(term.yellow("No issues to export."))
      return
    }

    // Determine target directory
    const beadsDir = opts.target || findBeadsDir(nodeFs, resolved.repoRoot) || `${resolved.repoRoot}/.beads`

    console.log(term.bold("Export Target"))
    console.log(`  .beads dir: ${beadsDir}`)
    console.log(`  Mode: ${opts.mode}`)
    console.log()

    if (opts.dryRun) {
      console.log(term.yellow("Dry run - no files will be written."))
      console.log()
    }

    // Run export
    const result = exportToBeads(issues, {
      beadsDir,
      mode: opts.mode as "append" | "replace",
      dryRun: opts.dryRun,
      fs: nodeFs,
    })

    console.log(term.bold("Results"))
    console.log(`  Exported: ${result.exported}`)
    if (result.errors.length > 0) {
      console.log(term.red(`  Errors: ${result.errors.length}`))
      for (const err of result.errors) {
        console.log(term.red(`    - ${err}`))
      }
    }

    if (result.exported > 0 && !opts.dryRun) {
      console.log()
      console.log(term.green(`✓ Exported ${result.exported} issues to ${result.outputPath}`))
    }
  })

/**
 * Pre-flight checks before reading from a managed `.beads/` directory.
 *
 * 1. Sync: when `bd` (Go binary) is on PATH, run `bd export` to refresh
 *    `issues.jsonl` from Dolt. The .jsonl is a derived artifact that
 *    drifts behind the database between commits — migrating from a stale
 *    file silently misses recent work. If `bd` is missing we fall back
 *    to a freshness warning based on mtime gap with the Dolt directory.
 * 2. Doctor: surface convention drift / stale beads / orphans before
 *    locking the state into markdown. Soft warning — never blocks.
 *
 * Both steps are best-effort: a missing `bd` binary, a `bd export`
 * non-zero, or a `bd doctor` warning all surface a hint but do not
 * abort the migration.
 */
function runPreflight(beadsDir: string): void {
  const sourceRoot = dirname(beadsDir)
  const issuesPath = join(beadsDir, "issues.jsonl")
  const doltDir = join(beadsDir, "dolt")

  console.log(term.bold("Pre-flight"))

  const bdAvailable = which("bd")
  if (bdAvailable) {
    console.log(term.dim("  Refreshing issues.jsonl via 'bd export'…"))
    const exp = spawnSync("bd", ["export"], { cwd: sourceRoot, encoding: "utf-8" })
    if (exp.status === 0) {
      console.log(term.green("  ✓ bd export"))
    } else {
      console.log(term.yellow(`  ! bd export exited ${exp.status} — using existing issues.jsonl`))
      if (exp.stderr) console.log(term.dim(`    ${exp.stderr.trim().split("\n").slice(0, 3).join("\n    ")}`))
    }
  } else {
    // No bd binary: fall back to mtime gap warning.
    if (nodeFs.existsSync(issuesPath) && nodeFs.existsSync(doltDir)) {
      const issuesMtime = statSync(issuesPath).mtimeMs
      const doltMtime = statSync(doltDir).mtimeMs
      const gapMs = doltMtime - issuesMtime
      if (gapMs > 60_000) {
        const minutes = Math.round(gapMs / 60_000)
        console.log(
          term.yellow(`  ! issues.jsonl is ${minutes}m older than .beads/dolt — install bd or run 'bd export' first`),
        )
      }
    } else {
      console.log(term.dim("  bd binary not on PATH — skipping export refresh"))
    }
  }

  if (bdAvailable) {
    const doc = spawnSync("bd", ["doctor"], { cwd: sourceRoot, encoding: "utf-8" })
    const out = `${doc.stdout ?? ""}${doc.stderr ?? ""}`.trim()
    if (doc.status === 0 && !/warn|error|stale|orphan|drift/i.test(out)) {
      console.log(term.green("  ✓ bd doctor"))
    } else {
      console.log(term.yellow("  ! bd doctor surfaced issues:"))
      const preview = out.split("\n").slice(0, 8).join("\n    ")
      if (preview) console.log(term.dim(`    ${preview}`))
      console.log(term.dim("    (proceeding — fix in source vault if needed and re-run)"))
    }
  }

  console.log()
}

/**
 * Cross-platform PATH lookup for a binary. Returns true when found.
 * Avoids requiring `which` on systems where it's a builtin (zsh) but
 * not a binary on PATH.
 */
function which(name: string): boolean {
  const PATH = process.env.PATH ?? ""
  const sep = process.platform === "win32" ? ";" : ":"
  for (const dir of PATH.split(sep)) {
    if (!dir) continue
    if (existsSync(join(dir, name))) return true
  }
  return false
}

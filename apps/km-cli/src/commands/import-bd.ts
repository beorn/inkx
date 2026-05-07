/**
 * Beads Import / Export Command
 *
 * `km import bd <vault>` is the canonical surface for moving data between
 * `.beads/issues.jsonl` and a km vault. It replaces the legacy
 * `km bd migrate` / `km bd export` subcommands — same engine, different
 * verb namespace.
 *
 * Default mode (import):
 *   km import bd                          # auto-discover .beads upward from cwd
 *   km import bd /path/to/km-vault        # explicit vault root
 *   km import bd --source /path/.beads    # explicit source .beads dir
 *   km import bd --file foreign.jsonl     # foreign-format import
 *
 * Reverse direction (km → .beads/issues.jsonl):
 *   km import bd --export                       # write to <vault>/.beads/issues.jsonl
 *   km import bd --export --target /path/.beads # explicit target .beads dir
 *
 * The engine itself lives in `@km/beads` (`migrateBeadsToMarkdown`,
 * `exportToBeads`, `recaptureFromExport`). This module is the CLI shell:
 * arg parsing, source discovery, pre-flight checks, output formatting.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import {
  Bead,
  findBeadsDir,
  getMigrationStats,
  migrateBeadsToMarkdown,
  exportToBeads,
  resolveBeadsRoots,
  resolveMemDir,
  recaptureFromExport,
  splitFrontmatter,
  bdIdToPathForm,
  type BeadsFs,
  type BeadsIssue,
} from "@km/beads"
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs"
import { parse as parseYaml } from "yaml"
import { basename, join, dirname, relative } from "node:path"
import { spawnSync } from "node:child_process"
import { getOriginalBeadsConfig, loadConfigObject } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { loadRepo } from "../load-repo.ts"

/** Real filesystem implementation for BeadsFs DI */
const nodeFs: BeadsFs = { existsSync, readFileSync, writeFileSync, mkdirSync }

/**
 * Build the `km import bd` subcommand. Registered under `importCommand`
 * by `apps/km-cli/src/commands/import.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- commander infers complex generic types
export function createBdImportCommand(): Command<any, any, any> {
  return (
    new Command("bd")
      .description("Import bd issues into a km vault (or export back to .beads/issues.jsonl)")
      .addHelpSection("Pipeline:", [
        ["1. Source", ".beads/issues.jsonl (auto-discovered, or via --source / --file)"],
        ["2. Convert", "bd issues → markdown beads in the configured beads root"],
        ["3. Memory", "bd memories → @memory/ subdir (collision-merge by source label)"],
      ])
      .addHelpSection(
        "Reverse direction:",
        "Pass --export to write km issues to <vault>/.beads/issues.jsonl. Use --target to override the .beads dir.",
      )
      .argument("[vault]", "km vault root (default: auto-detect from cwd)")
      // Source / target
      .option("--source <dir>", "Source .beads directory (or its parent). Defaults to auto-discovery upward from cwd.")
      .option("--file <path>", "Read issues directly from a .jsonl file (skips .beads discovery and pre-flight).")
      .option("--target <dir>", "Target dir: vault root for import; .beads dir for --export.")
      // Filtering / behaviour
      .option("--dry-run", "Show what would be migrated without writing files")
      .option("--status <statuses>", "Only migrate issues with these statuses (comma-separated)")
      .option("--no-preflight", "Skip pre-flight: bd export refresh + bd doctor.")
      .option(
        "--update-only",
        "Backfill missing frontmatter fields on existing vault beads from the export (ADD-only). Skip beads not yet in the vault.",
      )
      // Reverse direction
      .option(
        "--export",
        "Reverse direction: export km issues to .beads/issues.jsonl (writes the SOURCE-of-truth shape).",
      )
      .option("--mode <mode>", "Export mode: append or replace (only with --export)", "append")
      .action(async (vault, opts) => {
        if (opts.export) {
          await runExport(vault, opts)
          return
        }
        await runImport(vault, opts)
      })
  )
}

/**
 * Import direction: .beads/issues.jsonl → markdown in <vault>.
 */
async function runImport(
  vault: string | undefined,
  opts: {
    source?: string
    file?: string
    target?: string
    dryRun?: boolean
    status?: string
    preflight?: boolean
    updateOnly?: boolean
  },
): Promise<void> {
  const resolved = resolvePathArg(vault)
  const configObj = await loadKmBdConfig(resolved.repoRoot)

  // Source resolution: --file > --source > auto-discover. The migrate
  // helpers accept either a .beads dir or a direct .jsonl path; the CLI
  // surface mirrors that.
  const fileArg = opts.file
  const sourceArg = opts.source
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
  console.log(term.bold("Import Source"))
  if (fileArg) {
    console.log(`  File: ${fileArg}`)
  } else {
    console.log(`  .beads dir: ${migrateSource}`)
  }
  if (originalConfigPath) {
    console.log(`  Original config: ${originalConfigPath}`)
    if (originalConfig?.["issue-prefix"]) {
      console.log(`  Bead prefix: ${originalConfig["issue-prefix"]}`)
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

  // --update-only: don't create new files, only backfill missing
  // frontmatter fields on beads that already exist in the vault.
  // Target = live vault root (repoRoot), not an imports/ subdir, since
  // we're patching the canonical files in place.
  if (opts.updateOnly) {
    const vaultRoot = opts.target || resolved.repoRoot
    const indexBuildStart = Date.now()
    const index = buildVaultIdIndex(vaultRoot)
    const buildMs = Date.now() - indexBuildStart

    console.log(term.bold("Recapture Target"))
    console.log(`  Vault root:    ${vaultRoot}`)
    console.log(`  Index entries: ${index.size} (${buildMs}ms)`)
    if (opts.dryRun) console.log(term.yellow("  Dry run — no files will be written."))
    console.log()

    const result = recaptureFromExport(migrateSource, {
      fs: nodeFs,
      dryRun: opts.dryRun,
      sourcePrefix,
      resolveTarget: (issue: BeadsIssue) => {
        // Try canonical path-form first (cheap, hits ≈ all migrated beads).
        const pathForm = bdIdToPathForm(issue.id, sourcePrefix)
        if (pathForm) {
          const direct = join(vaultRoot, `${pathForm}.md`)
          if (existsSync(direct)) return direct
        }
        // Fall back to the id index (handles slug-augmented and aliased ids).
        return index.get(issue.id) ?? null
      },
    })

    console.log(term.bold("Results"))
    console.log(`  Patched:   ${result.patched.length}`)
    console.log(`  Unchanged: ${result.unchanged}`)
    console.log(`  Skipped:   ${result.skipped.length}`)
    if (result.errors.length > 0) {
      console.log(term.red(`  Errors:    ${result.errors.length}`))
    }
    console.log()
    // Per-bead lines so callers can grep `PATCH`/`SKIP`.
    for (const p of result.patched) {
      const rel = relative(vaultRoot, p.filepath)
      console.log(`  PATCH ${p.bdId} (${p.fieldsChanged.join(",")}) → ${rel}`)
    }
    if (result.skipped.length > 0) {
      for (const s of result.skipped) {
        console.log(term.dim(`  SKIP  ${s.bdId} — ${s.reason}`))
      }
    }
    for (const e of result.errors) {
      console.log(term.red(`  ERROR ${e.bdId} — ${e.error}`))
    }

    if (result.patched.length > 0 && !opts.dryRun) {
      console.log()
      console.log(term.green(`✓ Recaptured ${result.patched.length} beads in ${vaultRoot}`))
    }
    return
  }

  // Determine target directory and memory directory.
  //
  // Default target is the configured beads root (`<repoRoot>/<roots[0]>/`,
  // typically `<repoRoot>/beads/`). The migrate helper writes
  // `@<prefix>/<scope>/<slug>.md` underneath, so the on-disk layout is
  //   `<repoRoot>/<beadsRoot>/@<prefix>/<scope>/<slug>.md`.
  //
  // Memory layout is FLAT: every source merges into the single
  // `<beadsRoot>/@memory/` directory (resolveMemDir), keyed by slug.
  // On collision, migrate appends a `## From <source>` subsection.
  const kmConfig = loadConfigObject(resolved.repoRoot)
  const beadsRoots = resolveBeadsRoots(kmConfig.beads)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- resolveBeadsRoots always returns ≥1 element
  const defaultTargetDir = join(resolved.repoRoot, beadsRoots[0]!)
  const targetDir = opts.target || defaultTargetDir
  const memDir = resolveMemDir(resolved.repoRoot, kmConfig.beads)
  const sourceLabel = deriveImportSlug(beadsDir, fileArg, sourcePrefix)

  // Parse status filter
  const statusFilter = opts.status ? opts.status.split(",") : undefined

  console.log(term.bold("Import Target"))
  console.log(`  Target dir: ${targetDir}`)
  console.log(`  Memory dir: ${memDir}`)
  console.log(`  Layout:     <target>/@${sourcePrefix}/<scope>/<slug>.md + <memDir>/<key>.md`)
  console.log(`  Source:     ${sourceLabel} (collision-merge subsection)`)
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
    memDir,
    memSourceLabel: sourceLabel,
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
}

/**
 * Export direction: km issues → .beads/issues.jsonl.
 */
async function runExport(
  vault: string | undefined,
  opts: { target?: string; mode?: string; dryRun?: boolean },
): Promise<void> {
  const resolved = resolvePathArg(vault)
  await loadKmBdConfig(resolved.repoRoot)

  // Get issues from km — no global board filter; scope is derived per-issue
  // from the canonical id, so every scope-tagged item is an issue.
  using repo = await loadRepo(resolved.repoRoot)
  const issues = Bead.query(repo, {}, undefined, undefined)

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
    mode: (opts.mode ?? "append") as "append" | "replace",
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
}

/**
 * Derive the per-import subdirectory name under `imports/`.
 *
 * Format: `<source>-<YYYY-MM-DD>` — mirrors the Asana export convention
 * (`<workspace>-<date>`). Examples:
 *
 *   .beads at /Users/me/Code/km/.beads     → imports/km-2026-04-28/
 *   .beads at /Users/me/Code/decker/.beads → imports/decker-2026-04-28/
 *   --file /tmp/foreign-export.jsonl       → imports/foreign-export-2026-04-28/
 *
 * Source name = parent dir basename of `.beads`, or the .jsonl basename
 * (without extension) for --file imports. Falls back to the bd issue
 * prefix when neither is informative.
 */
function deriveImportSlug(beadsDir: string | undefined, fileArg: string | undefined, sourcePrefix: string): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  let source: string
  if (fileArg) {
    source = basename(fileArg).replace(/\.jsonl$/i, "")
  } else if (beadsDir) {
    source = basename(dirname(beadsDir))
  } else {
    source = sourcePrefix
  }
  // Sanitize — paths can contain odd chars, esp. for --file inputs.
  source = source.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || sourcePrefix
  return `${source}-${date}`
}

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
 * Walk the vault and build a `bdId → absolute file path` index by
 * reading frontmatter `id` + `aliases` from every `.md` file under
 * `vaultRoot`.
 *
 * Skips obvious non-bead trees (`node_modules`, `.git`, `vendor`,
 * `.claude`, `dist`, `imports`) so a 4700-bead vault indexes in well
 * under a second. The index is consulted only when the canonical
 * path-form lookup misses (slug-augmented or aliased ids).
 */
function buildVaultIdIndex(vaultRoot: string): Map<string, string> {
  const index = new Map<string, string>()
  const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "vendor",
    ".claude",
    "dist",
    "build",
    "out",
    "imports",
    ".cache",
    "tmp",
  ])

  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        walk(full)
        continue
      }
      if (!name.endsWith(".md")) continue
      let content: string
      try {
        content = readFileSync(full, "utf-8")
      } catch {
        continue
      }
      const split = splitFrontmatter(content)
      if (!split) continue
      let fm: Record<string, unknown>
      try {
        fm = (parseYaml(split.frontmatter) ?? {}) as Record<string, unknown>
      } catch {
        continue
      }
      const aliases = Array.isArray(fm.aliases) ? (fm.aliases as unknown[]).filter((x) => typeof x === "string") : []
      const id = typeof fm.id === "string" ? fm.id : null
      const shortId = typeof fm.short_id === "string" ? fm.short_id : null
      // Index by every form a bd issue might be referenced as. First-write
      // wins so the canonical file (deepest sigil-prefixed match) is kept.
      for (const key of [id, shortId, ...(aliases as string[])]) {
        if (!key) continue
        if (!index.has(key)) index.set(key, full)
      }
    }
  }

  walk(vaultRoot)
  return index
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

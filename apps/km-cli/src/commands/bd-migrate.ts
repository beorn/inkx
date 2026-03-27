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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { resolvePathArg, loadConfigObject, getOriginalBeadsConfig } from "@km/storage"

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
  .action((opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)

    // Find .beads directory
    const beadsDir = findBeadsDir(nodeFs, resolved.repoRoot)
    if (!beadsDir) {
      console.error(term.red("No .beads directory found."))
      console.log(term.dim("Run 'bd init' to initialize beads, or check your working directory."))
      process.exitCode = 1
      return
    }

    // Read original beads config for issue prefix
    const originalConfig = getOriginalBeadsConfig(resolved.repoRoot)
    const originalConfigPath = originalConfig ? join(beadsDir, "config.yaml") : undefined

    // Show stats first
    const stats = getMigrationStats(nodeFs, beadsDir)
    console.log(term.bold("Migration Source"))
    console.log(`  .beads dir: ${beadsDir}`)
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

    // Determine target directory
    const beadsConfig = configObj.beads
    const targetDir =
      opts.target || (beadsConfig.parent ? `${resolved.repoRoot}/${beadsConfig.parent}` : `${resolved.repoRoot}/issue`)

    // Parse status filter
    const statusFilter = opts.status ? opts.status.split(",") : undefined

    console.log(term.bold("Migration Target"))
    console.log(`  Target dir: ${targetDir}`)
    console.log(`  Board tag: @${beadsConfig.board}`)
    if (statusFilter) {
      console.log(`  Status filter: ${statusFilter.join(", ")}`)
    }
    console.log()

    if (opts.dryRun) {
      console.log(term.yellow("Dry run - no files will be written."))
      console.log()
    }

    // Run migration
    const result = migrateBeadsToMarkdown(beadsDir, {
      targetDir,
      boardTag: beadsConfig.board,
      statusFilter,
      dryRun: opts.dryRun,
      fs: nodeFs,
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
  .action((opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)

    // Get issues from km
    const boardTag = configObj.beads.board || undefined
    const issues = queryIssues({}, undefined, boardTag)

    console.log(term.bold("Export Source"))
    console.log(`  km issues: ${issues.length}`)
    if (boardTag) {
      console.log(`  Board filter: @${boardTag}`)
    }
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

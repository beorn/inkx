/**
 * Beads Doctor Commands — `km bd doctor <subcommand>`
 *
 * Diagnostic + repair helpers for the beads layout. Distinct from
 * `km doctor` (which targets the storage layer: state.db, changes.jsonl,
 * worktree integrity).
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { existsSync, readdirSync, renameSync, statSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { resolvePathArg } from "@km/fs-mount"
import { resolveBeadsRoots, resolveMemDir } from "@km/beads"
import { loadConfigObject } from "@km/storage"

const term = createTerm(process)

/**
 * Move every entry under `srcDir` into `dstDir`, creating `dstDir` when
 * absent. If a destination entry already exists, the source entry is
 * left in place — caller decides whether to surface an error (we only
 * warn, since manual edits inside the vault are not unusual).
 */
function moveDirContents(srcDir: string, dstDir: string, dryRun: boolean): { moved: number; skipped: string[] } {
  const result = { moved: 0, skipped: [] as string[] }
  if (!existsSync(srcDir)) return result
  if (!dryRun && !existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true })
  }
  for (const name of readdirSync(srcDir)) {
    const src = join(srcDir, name)
    const dst = join(dstDir, name)
    if (existsSync(dst)) {
      result.skipped.push(name)
      continue
    }
    if (!dryRun) renameSync(src, dst)
    result.moved++
  }
  return result
}

/**
 * `km bd doctor migrate-to-beads-root` — idempotent move of legacy
 * vault layouts into the configured beads root. Two transformations:
 *
 *   1. <vault>/mem/                    → <beadsRoot>/@memory/
 *   2. <vault>/imports/<src>-<date>/@<prefix>/
 *                                       → <beadsRoot>/@<prefix>/
 *      (mem subdirs inside imports/<src>-<date>/ also flow into @memory/)
 *
 * Idempotent: the command short-circuits when the destination already
 * exists for a given source. Re-running after a partial migration is
 * safe and will only move what's still on the legacy path.
 */
export const doctorMigrateToBeadsRootCommand = new Command("migrate-to-beads-root")
  .description("Move legacy <vault>/mem and <vault>/imports/<src>-<date>/* into the configured beads root")
  .option("--dry-run", "Report what would move without touching disk")
  .action(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const config = loadConfigObject(resolved.repoRoot)
    const primaryRoot = resolveBeadsRoots(config.beads)[0]!
    const beadsRootAbs = join(resolved.repoRoot, primaryRoot)
    const memDir = resolveMemDir(resolved.repoRoot, config.beads)

    console.log(term.bold("km bd doctor migrate-to-beads-root"))
    console.log(`  Vault root: ${resolved.repoRoot}`)
    console.log(`  Beads root: ${beadsRootAbs}`)
    console.log(`  Memory dir: ${memDir}`)
    if (opts.dryRun) console.log(term.yellow("  (dry-run — no changes)"))
    console.log()

    let totalMoved = 0
    const allSkipped: Array<{ src: string; entry: string }> = []

    // 1. Legacy <vault>/mem/ → <beadsRoot>/@memory/
    const legacyMem = join(resolved.repoRoot, "mem")
    if (existsSync(legacyMem)) {
      console.log(term.dim(`  ${legacyMem} → ${memDir}`))
      const out = moveDirContents(legacyMem, memDir, opts.dryRun ?? false)
      totalMoved += out.moved
      for (const e of out.skipped) allSkipped.push({ src: legacyMem, entry: e })
      console.log(`    moved ${out.moved}${out.skipped.length > 0 ? `, skipped ${out.skipped.length}` : ""}`)
    }

    // 2. <vault>/imports/<src>-<date>/* → <beadsRoot>/...
    //    - @<prefix>/ subdirs move to <beadsRoot>/@<prefix>/
    //    - mem/ subdirs flow into the flat <beadsRoot>/@memory/
    //    Other entries (e.g. README.md) are left in place; we only know
    //    how to relocate the well-known directory names.
    const importsRoot = join(resolved.repoRoot, "imports")
    if (existsSync(importsRoot) && statSync(importsRoot).isDirectory()) {
      for (const importDir of readdirSync(importsRoot)) {
        const importDirAbs = join(importsRoot, importDir)
        if (!statSync(importDirAbs).isDirectory()) continue
        for (const entry of readdirSync(importDirAbs)) {
          const srcAbs = join(importDirAbs, entry)
          if (!statSync(srcAbs).isDirectory()) continue
          if (entry === "mem") {
            console.log(term.dim(`  ${srcAbs} → ${memDir}`))
            const out = moveDirContents(srcAbs, memDir, opts.dryRun ?? false)
            totalMoved += out.moved
            for (const e of out.skipped) allSkipped.push({ src: srcAbs, entry: e })
            console.log(`    moved ${out.moved}${out.skipped.length > 0 ? `, skipped ${out.skipped.length}` : ""}`)
          } else if (entry.startsWith("@")) {
            const dstAbs = join(beadsRootAbs, entry)
            console.log(term.dim(`  ${srcAbs} → ${dstAbs}`))
            const out = moveDirContents(srcAbs, dstAbs, opts.dryRun ?? false)
            totalMoved += out.moved
            for (const e of out.skipped) allSkipped.push({ src: srcAbs, entry: e })
            console.log(`    moved ${out.moved}${out.skipped.length > 0 ? `, skipped ${out.skipped.length}` : ""}`)
          }
        }
      }
    }

    console.log()
    console.log(term.bold("Summary"))
    console.log(`  Moved:   ${totalMoved}`)
    console.log(`  Skipped: ${allSkipped.length}`)
    if (allSkipped.length > 0) {
      console.log(term.dim("  (skipped entries already exist at the destination — re-run after manual review)"))
    }
    if (totalMoved > 0 && !opts.dryRun) {
      console.log()
      console.log(term.dim("Run 'km doctor rebuild' to re-index the vault."))
    }
  })

/** Wire `bd doctor <subcommand>` onto a parent `bd` command. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Command's strongly-typed generics make uniform .addCommand variadics unergonomic; same exemption as bd.ts uses for shared-query. */
export function attachDoctorCommands(parent: { addCommand: (c: Command<any, any, any>) => unknown }): void {
  const doctor = new Command("doctor").description("Beads layout diagnostics + one-shot migrations")
  doctor.addCommand(doctorMigrateToBeadsRootCommand as Command<any, any, any>)
  parent.addCommand(doctor as Command<any, any, any>)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

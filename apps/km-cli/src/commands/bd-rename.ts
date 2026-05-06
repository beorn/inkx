/**
 * Beads Rename / Move — `bd rename <old> <new>` (alias `bd move`).
 *
 * Wave 6 thin alias shim. Delegates in-process to the canonical
 * `km move` command via `parseAsync`. The polymorphic dispatch in
 * `move.ts` resolves the second argument:
 *
 *   path-form (`@km/scope/foo`)  → newCanonicalId (rename + ref-rewrite)
 *   existing node                → newParentId   (reparent + ref-rewrite)
 *
 * One ref-rewrite engine (`repo.moveNodeWithRefs`); both bd rename and
 * km move share it. The L5 property test pins repo-state equivalence
 * across the two surfaces.
 *
 * BD_ALIASES table (see bd.ts):
 *   rename → ["move"]
 *
 * Surface deviations from the legacy bd surface (documented; not
 * silently broken):
 *   - bd-form id (`km-scope.new`) target shape is no longer accepted —
 *     pass path-form (`@km/scope/new`) instead. The bd-form `newShortId`
 *     branch was an artefact of the legacy IIFE; the alias-table goal
 *     is path-form everywhere.
 */

import { Command } from "@silvery/commander"
import { moveCommand } from "./move.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdRename(parent: BdRegistrar): void {
  const renameCmd = new Command("rename")
    .alias("move")
    .argument("<old-id>", "Current issue ID")
    .argument("<new-id>", "New issue ID (path-form `@km/scope/new` to rename; existing node id to reparent)")
    .description("Rename an issue ID (alias for `km move`; rewrites incoming references by default)")
    .option("--no-rewrite", "Skip rewriting incoming references")
    .option("--include-prose", "Also rewrite bare-id mentions in body text (slower; off by default)")
    .option("--dry-run", "Print the diff without writing anything")
    .actionMerged(async (opts) => {
      const argv: string[] = [opts.oldId, opts.newId]
      if (opts.rewrite === false) argv.push("--no-rewrite")
      if (opts.includeProse === true) argv.push("--include-prose")
      if (opts.dryRun === true) argv.push("--dry-run")
      await moveCommand.parseAsync(argv, { from: "user" })
    })
  parent.addCommand(renameCmd)
}

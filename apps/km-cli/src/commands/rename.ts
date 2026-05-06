/**
 * `km rename` — Move-as-Rename Alias
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: per the design's tension #11
 * (rename vs move), `move` is canonical. `km move <node> <target>`
 * polymorphically dispatches:
 *   - existing-id      → reparent (newParentId)
 *   - new path-form id → rename + ref-rewrite (newCanonicalId)
 *
 * `km rename` exists as an ergonomic alias for muscle memory (bd / git
 * users expect "rename"). It delegates to the same engine the polymorphic
 * `km move` uses — `repo.moveNodeWithRefs` — by re-routing argv into the
 * `moveCommand` action. One ref-rewrite engine, two surfaces — no
 * divergence by construction.
 *
 * The pre-Wave-6 implementation had a separate hand-rolled reparent
 * branch + an "id-rewrite not yet supported" error path. After Wave 6
 * collapsed bd-rename to a thin shim and made km move polymorphic, this
 * file is itself a thin shim — it parses the same args, sets up the same
 * options, and calls into moveCommand's action via parseAsync.
 */

import { Command } from "@silvery/commander"
import { moveCommand } from "./move.ts"

export const renameCommand = new Command("rename")
  .description("Rename / reparent a node (alias of `km move`; uses the same ref-rewrite engine)")
  .argument("<id>", "Node to rename (ID, path, or filename)")
  .argument("<target>", "Target: existing node id (reparent) or new path-form id (rename)")
  .option("--no-rewrite", "Skip rewriting incoming references")
  .option("--include-prose", "Also rewrite bare-id mentions in body text (slower; off by default)")
  .option("--dry-run", "Print the diff without writing anything")
  .option("--json", "Output as JSON")
  .action(async (idArg: string, targetArg: string, options: Record<string, unknown>) => {
    // Forward to moveCommand. Build argv the same way commander would
    // for `km move <id> <target> [...flags]` so the polymorphic
    // dispatch in move.ts handles both reparent and rename.
    const argv = [idArg, targetArg]
    if (options.rewrite === false) argv.push("--no-rewrite")
    if (options.includeProse === true) argv.push("--include-prose")
    if (options.dryRun === true) argv.push("--dry-run")
    if (options.json === true) argv.push("--json")
    await moveCommand.parseAsync(argv, { from: "user" })
  })

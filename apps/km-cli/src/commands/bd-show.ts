/**
 * Beads Show — `bd show <id>`
 *
 * Prints issue details. Routes through the shared `printTaskDetails`
 * helper so `bd show <id>` and `tasks <id>` stay in sync; the JSON path
 * uses bd's snake_case shape (issueToBdJson) for backwards compatibility
 * with `bd export` and external scripts.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveTaskNode } from "../utils/resolve-task.ts"
import { printTaskDetails } from "./shared-show.ts"
import { issueToBdJson } from "./bd-format.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdShow(parent: BdRegistrar): void {
  const showCmd = new Command("show")
    .argument("[id]", "Bead ID")
    .description("Show issue details")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      if (!opts.id) {
        showCmd.outputHelp()
        return
      }

      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)
      const node = resolveTaskNode(repo, opts.id)

      if (!node) {
        console.error(term.red(`Bead not found: ${opts.id}`))
        process.exitCode = 1
        return
      }

      if (opts.json) {
        // Preserve bd-compatible JSON shape (snake_case fields like
        // issue_type, dependency_count) by routing through issueToBdJson
        // — printTaskDetails' JSON path emits the camelCase Bead shape.
        // For non-bead nodes (no data.id), Bead.from returns null; emit a
        // bare {} to preserve the legacy "show always emits something"
        // contract — the user got a node match, just not a bead-shaped one.
        const bead = Bead.from(node, { repo })
        console.log(JSON.stringify(bead ? issueToBdJson(bead) : {}, null, 2))
        return
      }

      printTaskDetails(repo, node, { bd: true })
    })
  parent.addCommand(showCmd)
}

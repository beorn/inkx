/**
 * Beads Lifecycle Transitions — `bd close | drop`
 *
 * Lifecycle transitions are deliberately distinct from raw `set status:X`
 * field writes (per task-bd-collapse Wave 3): they invoke `Bead.close` /
 * `Bead.drop` which set `closedAt`, optionally record a reason, and merge
 * frontmatter `data.*` for cross-tool readability.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). The action handlers here are the "shared lifecycle
 * primitive" the bd alias layer ultimately delegates to (until `km task
 * close --reason TEXT` lands as a Wave 3 deliverable).
 *
 * See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

/**
 * `bd close <id> [--reason TEXT]` — mark an issue done with optional reason.
 *
 * Workflow transition (NOT a raw `set status:done`): calls `Bead.close`,
 * which sets `closedAt`, records the reason, and merges `data.*` for
 * downstream tooling (bd, gh, asana exports).
 */
export function registerBdClose(parent: BdRegistrar): void {
  const closeCmd = new Command("close")
    .argument("[id]", "Bead ID")
    .description("Close an issue (mark as done)")
    .option("-r, --reason <reason>", "Close reason")
    .actionMerged(async (opts) => {
      if (!opts.id) {
        closeCmd.outputHelp()
        return
      }

      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)
      const issue = resolveIssueArg(repo, opts.id)
      if (!issue) {
        console.error(term.red(`Bead not found: ${opts.id}`))
        process.exitCode = 1
        return
      }

      const node = repo.getNode(issue.id)
      const currentData = node?.data as Record<string, unknown> | undefined
      const updates = Bead.close(repo, issue, opts.reason, currentData)
      repo.updateNode(issue.id, updates)

      console.log(term.green(`Closed ${issue.shortId}`))
      if (opts.reason) console.log(term.dim(`Reason: ${opts.reason}`))
    })
  parent.addCommand(closeCmd)
}

/**
 * `bd drop <id> [--reason TEXT]` — mark an issue won't-do with optional
 * reason. Same lifecycle shape as close, but the dropped status preserves
 * the "we considered it; chose not to" signal in close-reasons audits.
 */
export function registerBdDrop(parent: BdRegistrar): void {
  const dropCmd = new Command("drop")
    .argument("[id]", "Bead ID")
    .description("Drop an issue (mark as won't do)")
    .option("-r, --reason <reason>", "Drop reason")
    .actionMerged(async (opts) => {
      if (!opts.id) {
        dropCmd.outputHelp()
        return
      }

      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)
      const issue = resolveIssueArg(repo, opts.id)
      if (!issue) {
        console.error(term.red(`Bead not found: ${opts.id}`))
        process.exitCode = 1
        return
      }

      const node = repo.getNode(issue.id)
      const currentData = node?.data as Record<string, unknown> | undefined
      const updates = Bead.drop(repo, issue, opts.reason, currentData)
      repo.updateNode(issue.id, updates)

      console.log(term.yellow(`Dropped ${issue.shortId}`))
      if (opts.reason) console.log(term.dim(`Reason: ${opts.reason}`))
    })
  parent.addCommand(dropCmd)
}

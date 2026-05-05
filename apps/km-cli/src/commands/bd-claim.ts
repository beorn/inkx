/**
 * Beads Claim — `bd claim <id>`
 *
 * Convenience for `bd update <id> --claim`: sets status=wip and assignee
 * to the current user. The shared lifecycle primitive that `km task claim`
 * (singular surface, post-Wave-3) ultimately delegates to.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { resolveAssignee } from "../utils/assignee.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdClaim(parent: BdRegistrar): void {
  const claimCmd = new Command("claim")
    .argument("<id>", "Bead ID")
    .description("Claim an issue (set status to wip and assign to you)")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)
      const issue = resolveIssueArg(repo, opts.id)
      if (!issue) {
        console.error(term.red(`Bead not found: ${opts.id}`))
        process.exitCode = 1
        return
      }

      const assignee = resolveAssignee()
      const updates = Bead.update(repo, issue, { status: "wip", assignee })
      repo.updateNode(issue.id, updates)

      console.log(term.green(`Claimed ${issue.shortId}`))
      console.log(term.dim(`  Status: wip`))
      console.log(term.dim(`  Assignee: ${assignee}`))
    })
  parent.addCommand(claimCmd)
}

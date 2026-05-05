/**
 * Beads Blocked — `bd blocked`
 *
 * Lists all open issues that have at least one blocked-by edge.
 * Intentionally simple: pulls every bead, filters by `blockedBy.length > 0`
 * and active status (todo/wip/blocked). Done/dropped are excluded — a
 * historically-blocked closed issue is not "currently blocked".
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { issueToBdJson, printIssue } from "./bd-format.ts"
import { writeJsonOut } from "./bd-shared-io.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdBlocked(parent: BdRegistrar): void {
  const blockedCmd = new Command("blocked")
    .description("List all blocked issues")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      await loadKmBdConfig(resolved.repoRoot)
      using repo = await loadRepo(resolved.repoRoot)

      const issues = Bead.query(repo, {}, undefined, undefined)
      const blocked = issues.filter(
        (i) => i.blockedBy && i.blockedBy.length > 0 && i.status !== "done" && i.status !== "dropped",
      )

      if (opts.json) {
        await writeJsonOut(blocked.map(issueToBdJson))
        return
      }

      if (blocked.length === 0) {
        console.log(term.green("No blocked issues."))
        return
      }

      console.log(term.bold(`Blocked issues (${blocked.length}):\n`))
      for (const issue of blocked) {
        const blockers = issue.blockedBy?.join(", ") ?? ""
        printIssue(issue)
        console.log(term.dim(`    blocked-by: ${blockers}`))
      }
    })
  parent.addCommand(blockedCmd)
}

/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: opts.days! after Commander default-int validation; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Beads Stale — `bd stale [-d N]`
 *
 * Lists open issues not updated in the last N days. Wraps `Bead.query` and
 * filters by `updatedAt < threshold` with a status guard (open/wip/blocked
 * only — done/dropped don't go stale by definition).
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command, int } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { issueToBdJson, printIssue } from "./bd-format.ts"
import { writeJsonOut } from "./bd-shared-io.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdStale(parent: BdRegistrar): void {
  const staleCmd = new Command("stale")
    .description("List issues not updated in N days")
    .option("-d, --days <n>", "Days threshold", int, 14)
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      await loadKmBdConfig(resolved.repoRoot)
      using repo = await loadRepo(resolved.repoRoot)

      const issues = Bead.query(repo, {}, undefined, undefined)
      const threshold = Date.now() - opts.days! * 86400000
      const stale = issues.filter((i) => i.updatedAt < threshold && i.status !== "done" && i.status !== "dropped")

      if (opts.json) {
        await writeJsonOut(stale.map(issueToBdJson))
        return
      }

      if (stale.length === 0) {
        console.log(term.green(`No stale issues (threshold: ${opts.days} days).`))
        return
      }

      console.log(term.bold(`Stale issues (not updated in ${opts.days}+ days):\n`))
      for (const issue of stale) {
        printIssue(issue)
      }
    })
  parent.addCommand(staleCmd)
}

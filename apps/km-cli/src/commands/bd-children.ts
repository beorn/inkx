/**
 * Beads Children — `bd children <id>`
 *
 * Wave 6 alias-table goal: `children → ["show", "-c"]`. Kept legacy
 * because `Bead.children` walks BOTH the structural parent_id children
 * AND the path-form sibling-folder children (`@km/scope/foo.md` ↔
 * `@km/scope/foo/`). `km show <id> -c` uses `repo.getChildren(id)`
 * which is structural-parent_id only — it misses the file-backed
 * sibling files. Until `km show -c` learns the path-form hierarchy
 * (Wave 4/7 promotion), bd-children stays on Bead.children.
 *
 * The L5 property test pins repo-state equivalence on the operations
 * that DO have parity (close/drop/claim/etc.); children is not in the
 * delegated set.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead, buildDependentCountMap } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { issueToBdJson, printIssue } from "./bd-format.ts"
import { writeJsonOut } from "./bd-shared-io.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdChildren(parent: BdRegistrar): void {
  const childrenCmd = new Command("children")
    .argument("<id>", "Bead ID")
    .description("List children of an issue (e.g., sub-tasks of an epic)")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)
      const issue = resolveIssueArg(repo, opts.id)
      if (!issue) {
        console.error(term.red(`Bead not found: ${opts.id}`))
        process.exitCode = 1
        return
      }

      const dependentCountMap = buildDependentCountMap(repo)
      const childIssues = Bead.children(repo, issue, { dependentCountMap })

      if (opts.json) {
        await writeJsonOut(childIssues.map(issueToBdJson))
        return
      }

      if (childIssues.length === 0) {
        console.log(term.dim(`${issue.shortId} has no child tasks.`))
        return
      }

      console.log(term.bold(`Children of ${issue.shortId} (${childIssues.length}):\n`))
      for (const child of childIssues) {
        printIssue(child)
      }
    })
  parent.addCommand(childrenCmd)
}

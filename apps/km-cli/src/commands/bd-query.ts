/**
 * Beads Query — `bd query <expression...>`
 *
 * Raw DSL query — bypasses the default board-membership filter.
 * Caller-side responsibility to scope by `path:`, `parent:`, etc.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead, buildDependentCountMap, type Bead as BeadType } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { issueToBdJson, printIssue } from "./bd-format.ts"
import { writeJsonOut } from "./bd-shared-io.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdQuery(parent: BdRegistrar): void {
  const queryCmd = new Command("query")
    .argument("<expression...>", "DSL query expression")
    .description("Query issues with raw DSL expression (no default board filter)")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const expression = opts.expression.join(" ")

      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)

      const nodes = repo.query(expression)
      const dependentCountMap = buildDependentCountMap(repo)
      const issues: BeadType[] = nodes
        .map((n) => Bead.from(n, { repo, dependentCountMap }))
        .filter((b): b is BeadType => b !== null)

      if (opts.json) {
        await writeJsonOut(issues.map(issueToBdJson))
        return
      }

      if (issues.length === 0) {
        console.log(term.yellow("No issues found."))
        return
      }

      console.log(term.bold(`Issues (${issues.length}):\n`))
      for (const issue of issues) {
        printIssue(issue)
      }
    })
  parent.addCommand(queryCmd)
}

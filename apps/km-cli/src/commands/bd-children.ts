/**
 * Beads Children — `bd children <id>`
 *
 * Lists children of an issue (e.g., sub-tasks of an epic).
 *
 * In the path-form hierarchy, sub-issues of `foo.md` live in the sibling
 * folder `foo/`. We walk both the in-file paragraph children and the
 * path-folder file children so the tree the user sees on disk matches
 * what `bd children` reports.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead, buildDependentCountMap, type Bead as BeadType } from "@km/beads"
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

      // In the path-form hierarchy, sub-issues of `foo.md` live in the
      // sibling folder `foo/`. Walk both the in-file paragraph children
      // and the path-folder file children so the tree the user sees on
      // disk matches what `bd children` reports.
      //
      // The folder lookup must use the node's fs_path (which always ends
      // in `.md` for file-class nodes) rather than `issue.id` — node ids
      // can be either path-strings (`issue/silvercode/acp.md`) or ULIDs
      // (`01KQ…`) depending on how the repo was loaded.
      const issueNode = repo.getNode(issue.id)
      const inFileChildren = repo.getChildren(issue.id)
      // Folder nodes carry path-string ids matching their fs_path
      // (e.g. `issue/silvercode/acp`), so the folder for `foo.md` is
      // simply `<fs_path>` with the `.md` suffix dropped.
      const folderId = issueNode?.fs_path?.endsWith(".md") ? issueNode.fs_path.slice(0, -3) : null
      const pathChildren = folderId ? repo.getChildren(folderId) : []
      const allChildren = [...inFileChildren, ...pathChildren]
      const dependentCountMap = buildDependentCountMap(repo)
      const childIssues: BeadType[] = allChildren
        .filter((c) => c.item?.task?.status != null || c.fs_path?.endsWith(".md"))
        .map((c) => Bead.from(c, { repo, dependentCountMap }))
        .filter((b): b is BeadType => b !== null)

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

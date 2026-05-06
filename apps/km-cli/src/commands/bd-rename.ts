/**
 * Beads Rename / Move — `bd rename <old> <new>` (alias `bd move`)
 *
 * Rewrites a bead id and (by default) every incoming reference: wikilinks,
 * transclusions, dep-edges, alias props, parent_id prop, blocked-by props.
 * Bare-id prose mentions are opt-in via `--include-prose`.
 *
 * Routes through `repo.moveNodeWithRefs` (the canonical move-with-refs
 * primitive) — both `bd rename` and `bd move` are aliases that share one
 * ref-rewrite engine. Post-move, the bead's child directory
 * (`@km/scope/parent.md` ↔ `@km/scope/parent/`) is relocated via
 * `relocateBeadSiblingTree`.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { relocateBeadSiblingTree } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { resolveTaskNode } from "../utils/resolve-task.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdRename(parent: BdRegistrar): void {
  const renameCmd = new Command("rename")
    .alias("move")
    .argument("<old-id>", "Current issue ID")
    .argument("<new-id>", "New issue ID")
    .description("Rename an issue ID (rewrites all incoming references by default)")
    .option("--no-rewrite", "Skip rewriting incoming references (legacy behaviour: only short_id + blocked-by)")
    .option("--include-prose", "Also rewrite bare-id mentions in body text (slower; off by default)")
    .option("--dry-run", "Print the diff without writing anything")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)

      // Resolve to any node (path-form, alias, ULID), not just promoted-bead
      // nodes. moveNodeWithRefs is a node-level primitive that works on any
      // KNode by id; a node match is sufficient — the underlying mutation
      // walks the full link graph regardless of bead shape.
      //
      // Prefer the file node (fs_path ends with .md) over a same-named folder
      // node — once a bead has children, its directory and its .md file share
      // the same path-form id, and a path-form lookup matches the folder
      // first. The bead-content lives in the .md file; that's what we move.
      let node = opts.oldId.includes("/") ? resolveTaskNode(repo, `${opts.oldId.replace(/\.md$/, "")}.md`) : null
      if (!node) {
        node = resolveTaskNode(repo, opts.oldId)
      }
      if (!node) {
        console.error(term.red(`Bead not found: ${opts.oldId}`))
        process.exitCode = 1
        return
      }

      // Distinguish path-form (`@km/scope/new`) from bd-form (`km-scope.new`).
      // Path-form maps to `newCanonicalId` so moveNodeWithRefs derives the new
      // fs_path from the sigil-prefixed path; bd-form maps to `newShortId` and
      // leaves the file in place under its existing path. Both update aliases.
      const isPathForm = opts.newId.includes("/")
      const spec = isPathForm ? { newCanonicalId: opts.newId } : { newShortId: opts.newId }

      // --dry-run: compute the rewrite preview without applying anything.
      // Mirrors `move.ts` --dry-run; uses `getRenameImpact` (the same
      // backlink walker the real rename uses) so the dry-run is faithful
      // to what would happen.
      // CI-gateable invariant: dry-run NEVER calls a mutation method.
      if (opts.dryRun) {
        const impact = repo.getRenameImpact(node.id)
        const wouldRewrite = opts.rewrite !== false
        console.log(`Would rename ${opts.oldId} → ${opts.newId}`)
        if (isPathForm && node.fs_path) {
          // path-form rename derives a new fs_path; bd-form leaves it in place.
          const newFsPath = `${opts.newId}.md`
          if (newFsPath !== node.fs_path) {
            console.log(`Would relocate file: ${node.fs_path} → ${newFsPath}`)
          }
        }
        if (wouldRewrite && impact.backlinks.length > 0) {
          console.log(
            `Would rewrite ${impact.backlinks.length} reference${impact.backlinks.length === 1 ? "" : "s"} across host files.`,
          )
        } else if (!wouldRewrite) {
          console.log(
            `(--no-rewrite: ${impact.backlinks.length} reference${impact.backlinks.length === 1 ? "" : "s"} would be left dangling)`,
          )
        } else {
          console.log("No incoming references to rewrite.")
        }
        if (impact.childCount > 0) {
          console.log(`Would carry ${impact.childCount} child node${impact.childCount === 1 ? "" : "s"} along.`)
        }
        if (impact.ruleRefs > 0) {
          console.log(`Would update ${impact.ruleRefs} rule reference${impact.ruleRefs === 1 ? "" : "s"}.`)
        }
        if (impact.propRefs > 0) {
          console.log(`Would update ${impact.propRefs} property reference${impact.propRefs === 1 ? "" : "s"}.`)
        }
        console.log(term.dim("No changes written. Run without --dry-run to apply."))
        return
      }

      // Use the canonical move-with-refs primitive. Default behaviour:
      //   - rewrites wikilinks, transclusions, dep-edges, alias props,
      //     parent_id prop, blocked-by props
      //   - bare-id prose mentions opt-in via --include-prose
      //   - --no-rewrite skips the walk entirely (legacy behaviour preserved
      //     for callers that need it)
      const oldFsPath = node.fs_path ?? null
      const result = repo.moveNodeWithRefs(node.id, spec, {
        noRewrite: opts.rewrite === false,
        includeProse: opts.includeProse === true,
      })

      // Post-move sibling-tree relocation: handle the bead's child directory
      // (`@km/scope/parent.md` ↔ `@km/scope/parent/`) — see
      // `@km/beads/move-bead.ts` for the why.
      if (isPathForm) {
        const relocate = relocateBeadSiblingTree(repo, {
          repoRoot: resolved.repoRoot,
          oldFsPath,
          newFsPath: result.newFsPath ?? null,
        })
        if (relocate.warning) {
          console.warn(term.yellow(`Warning: ${relocate.warning}`))
        }
      }

      console.log(term.green(`Renamed ${opts.oldId} → ${opts.newId}`))
      if (result.rewroteRefs > 0) {
        console.log(
          `Updated ${result.rewroteRefs} reference${result.rewroteRefs > 1 ? "s" : ""} in ${result.rewroteHosts} file${result.rewroteHosts > 1 ? "s" : ""}`,
        )
      }
      if (result.failedHosts.length > 0) {
        console.warn(
          term.yellow(
            `Warning: ${result.failedHosts.length} host${result.failedHosts.length > 1 ? "s" : ""} failed to rewrite (see logs)`,
          ),
        )
      }
    })
  parent.addCommand(renameCmd)
}

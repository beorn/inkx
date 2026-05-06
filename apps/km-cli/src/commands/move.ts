/**
 * Move Command — polymorphic dispatch
 *
 * `km move <node> <target>` resolves `<target>` polymorphically:
 *
 *   1. existing node id/path/name  → reparent (newParentId)
 *   2. new path-form id (`@scope/name`, no node exists)
 *                                  → rename + ref-rewrite (newCanonicalId)
 *   3. --to-root flag              → move to root (newParentId = null)
 *   4. --project <name>            → reparent under named project
 *
 * Both reparent and rename go through one ref-rewrite engine —
 * `repo.moveNodeWithRefs` — so they cannot diverge by construction.
 *
 *   km move foo @scope/existing       # reparent under existing node
 *   km move foo @scope/new-id         # rename: rewrites the canonical id + refs
 *   km move foo --to-root             # move to root
 *   km move foo --project "Inbox"     # reparent under named project
 *
 * `--include-prose` opts into bare-id prose-mention rewriting (slow, off
 * by default; mirrors `bd rename --include-prose`).
 *
 * Path-form detection: a `<target>` is treated as a new-canonical-id
 * candidate only if (a) it looks like a path-form id (`^@<word>/...`)
 * AND (b) no node currently resolves to it. This keeps the common case
 * of `km move foo @existing-board` working as a reparent — the engine
 * tries the existing-node lookup first.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { findProject } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { relocateBeadSiblingTree } from "@km/beads"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { getNodeDisplayName } from "@km/tree"
import type { KNode, KLink } from "@km/core"

/**
 * Path-form heuristic: matches `@<scope>/...` (sigil + at least one slash
 * separator). Used to recognize the rename-mode target shape so a user
 * mistyped existing-id never silently routes to rename.
 */
function looksLikePathFormId(s: string): boolean {
  return /^@[^/\s]+\/.+/.test(s)
}

export const moveCommand = new Command("move")
  .description("Move (reparent) or rename a node — rewrites incoming references by default")
  .argument("<node>", "Node to move (ID, path, or filename)")
  .argument("[target]", "Target: existing node (reparent) or new path-form id (rename)")
  .option("-p, --project <name>", "Move to project by name")
  .option("--to-root", "Move to root level (no parent)")
  .option("--no-rewrite", "Skip rewriting incoming references")
  .option("--include-prose", "Also rewrite bare-id mentions in body text (slower; off by default)")
  .option("--dry-run", "Print the diff without writing anything")
  .option("--json", "Output as JSON")
  .action(async (nodeArg, targetArg, options) => {
    // Resolve the node argument - may detect repo root from path
    const resolvedNode = resolvePathArg(nodeArg, getRootPath())
    using repo = await loadRepo(resolvedNode.repoRoot)

    const nodeRef = resolvedNode.nodeRef
    if (!nodeRef) {
      console.error(term.red(`Cannot move a directory`))
      process.exit(1)
    }

    // Find the node to move (nodeRef validated above)
    const node = repo.resolveNode(nodeRef)
    if (!node) {
      console.error(term.red(`Node not found: ${nodeArg}`))
      process.exit(1)
    }

    // ─── Determine mode: rename vs reparent ────────────────────────────
    // Rename mode (newCanonicalId path) is selected when:
    //   - target looks like a path-form id (@scope/...)
    //   - AND no existing node resolves to that target
    //   - AND no project / to-root flag is set
    // Otherwise we're in reparent mode (newParentId path).
    let renameMode = false
    let newCanonicalId: string | undefined
    let targetParent: KNode | null = null
    let targetParentId: string | null = null

    if (options.toRoot) {
      // Reparent → root. null parent.
      targetParentId = null
    } else if (options.project) {
      // Reparent → named project.
      targetParent = findProject(repo.database, options.project)
      if (!targetParent) {
        console.error(term.red(`Project not found: ${options.project}`))
        process.exit(1)
      }
      targetParentId = targetParent.id
    } else if (targetArg) {
      // Polymorphic dispatch:
      //   1. Try to resolve as existing node → reparent
      //   2. Else, if path-form-id-shaped → rename
      //   3. Else, error with both candidates listed
      const resolvedParent = resolvePathArg(targetArg, resolvedNode.repoRoot)
      const parentRef = resolvedParent.nodeRef
      if (parentRef) {
        targetParent = repo.resolveNode(parentRef)
      }

      if (!targetParent && looksLikePathFormId(targetArg)) {
        // Rename mode — target doesn't exist as a node and looks like
        // a canonical path-form id. This reuses the same engine
        // (`moveNodeWithRefs` with newCanonicalId) that bd rename uses.
        renameMode = true
        newCanonicalId = targetArg
      } else if (!targetParent) {
        console.error(
          term.red(
            `Target not found: ${targetArg}\n` +
              `Hint: pass an existing node id to reparent, or a fresh path-form id like '@scope/name' to rename.`,
          ),
        )
        process.exit(1)
      } else {
        targetParentId = targetParent.id
      }
    } else {
      console.error(
        term.red("Specify a target (existing-id to reparent, or new path-form id to rename), --project, or --to-root"),
      )
      process.exit(1)
    }

    // ─── Validation common to both modes ───────────────────────────────
    if (!renameMode && targetParentId === node.id) {
      console.error(term.red("Cannot move a node to itself"))
      process.exit(1)
    }

    // No-op detection: in reparent mode, hitting the existing parent.
    if (!renameMode && targetParentId === node.parent_id) {
      if (options.json) {
        console.log(
          JSON.stringify({
            id: node.id,
            parent_id: targetParentId,
            unchanged: true,
          }),
        )
        return
      }
      console.log(term.yellow("Node is already at this location"))
      return
    }

    // ─── --dry-run: preview without writing ────────────────────────────
    // CI-gateable invariant: dry-run NEVER calls a mutation method.
    if (options.dryRun) {
      const impact = repo.getRenameImpact(node.id)
      const nodeName = getNodeDisplayName(node)
      const targetName = renameMode
        ? newCanonicalId!
        : targetParent
          ? getNodeDisplayName(targetParent)
          : "(root)"
      if (options.json) {
        console.log(
          JSON.stringify({
            dryRun: true,
            mode: renameMode ? "rename" : "reparent",
            id: node.id,
            from: { name: nodeName, parent_id: node.parent_id, fs_path: node.fs_path },
            to: renameMode
              ? { canonicalId: newCanonicalId, name: nodeName }
              : { name: nodeName, parent_id: targetParentId },
            impact: {
              backlinks: impact.backlinks.length,
              childCount: impact.childCount,
              ruleRefs: impact.ruleRefs,
              propRefs: impact.propRefs,
              rewriteHosts: options.rewrite === false ? 0 : impact.backlinks.length,
            },
          }),
        )
        return
      }
      const verb = renameMode ? "rename" : "move"
      console.log(`Would ${verb} ${nodeName} → ${targetName}`)
      if (renameMode && node.fs_path) {
        const newFsPath = `${newCanonicalId}.md`
        if (newFsPath !== node.fs_path) {
          console.log(`Would relocate file: ${node.fs_path} → ${newFsPath}`)
        }
      }
      const wouldRewrite = options.rewrite !== false
      if (wouldRewrite && impact.backlinks.length > 0) {
        console.log(
          `Would rewrite references in ${impact.backlinks.length} link${impact.backlinks.length === 1 ? "" : "s"}:`,
        )
        for (const link of impact.backlinks.slice(0, 25)) {
          // backlinksForNodeId enriches KLink with `host_id` — the
          // upstream node that contains the reference. The KLink type
          // doesn't pin this field at compile time, so we read it via
          // a structural cast.
          const hostId = (link as KLink & { host_id?: string }).host_id
          const host = hostId ? repo.getNode(hostId) : null
          const label = host?.fs_path ?? host?.name ?? hostId ?? "(unknown)"
          console.log(`  ${label}`)
        }
        if (impact.backlinks.length > 25) {
          console.log(`  … and ${impact.backlinks.length - 25} more`)
        }
      } else if (!wouldRewrite) {
        console.log(
          `(--no-rewrite: ${impact.backlinks.length} link${impact.backlinks.length === 1 ? "" : "s"} would be left dangling)`,
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

    // ─── Apply: one engine for both modes ──────────────────────────────
    // moveNodeWithRefs accepts either spec shape (renameMode picks
    // newCanonicalId; reparent mode picks newParentId). Defaults:
    //   - rewrites wikilinks, transclusions, dep-edges, alias / parent_id
    //     props, blocked-by props.
    //   - bare-id prose mentions opt-in via --include-prose.
    //   - --no-rewrite skips the walk entirely.
    const oldFsPath = node.fs_path ?? null
    const spec = renameMode ? { newCanonicalId } : { newParentId: targetParentId }
    const result = repo.moveNodeWithRefs(node.id, spec, {
      noRewrite: options.rewrite === false,
      includeProse: options.includeProse === true,
    })

    // Post-rename sibling-tree relocation: handle any bead's child
    // directory shape (`@km/scope/parent.md` ↔ `@km/scope/parent/`). Only
    // applies in rename mode; reparent doesn't change the canonical path.
    if (renameMode) {
      const relocate = relocateBeadSiblingTree(repo, {
        repoRoot: resolvedNode.repoRoot,
        oldFsPath,
        newFsPath: result.newFsPath ?? null,
      })
      if (relocate.warning) {
        console.warn(term.yellow(`Warning: ${relocate.warning}`))
      }
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          mode: renameMode ? "rename" : "reparent",
          id: node.id,
          ...(renameMode
            ? { canonicalId: newCanonicalId, fs_path: result.newFsPath ?? null }
            : { parent_id: targetParentId }),
          rewroteHosts: result.rewroteHosts,
          rewroteRefs: result.rewroteRefs,
        }),
      )
      return
    }

    const nodeName = getNodeDisplayName(node)
    const targetName = renameMode
      ? newCanonicalId!
      : targetParent
        ? getNodeDisplayName(targetParent)
        : "(root)"
    const verb = renameMode ? "Renamed" : "Moved"
    const refsSuffix =
      result.rewroteRefs > 0
        ? ` (rewrote ${result.rewroteRefs} ref${result.rewroteRefs === 1 ? "" : "s"} in ${result.rewroteHosts} file${result.rewroteHosts === 1 ? "" : "s"})`
        : ""
    console.log(term.green("→"), `${verb} ${nodeName} → ${targetName}${refsSuffix}`)
    if (result.failedHosts.length > 0) {
      console.warn(
        term.yellow(
          `Warning: ${result.failedHosts.length} host${result.failedHosts.length > 1 ? "s" : ""} failed to rewrite (see logs)`,
        ),
      )
    }
  })

/**
 * Move Command
 *
 * Re-parent a node to a different location
 *
 * km move <node> <parent>          # Move by ID, path, or filename
 * km move <node> --project "Name"  # Move by project name
 * km move <node> --root            # Move to root level
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { findProject } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { getNodeDisplayName } from "@km/tree"
import type { KNode, KLink } from "@km/core"

export const moveCommand = new Command("move")
  .description("Move a node to a different parent (rewrites incoming references by default)")
  .argument("<node>", "Node to move (ID, path, or filename)")
  .argument("[parent]", "Target parent (ID, path, or filename)")
  .option("-p, --project <name>", "Move to project by name")
  .option("--to-root", "Move to root level (no parent)")
  .option("--no-rewrite", "Skip rewriting incoming references")
  .option("--dry-run", "Print the diff without writing anything")
  .option("--json", "Output as JSON")
  .action(async (nodeArg, parentArg, options) => {
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

    // Determine target parent
    let targetParent: KNode | null = null
    let targetParentId: string | null = null

    if (options.toRoot) {
      // Move to root - null parent
      targetParentId = null
    } else if (options.project) {
      // Find project by name
      targetParent = findProject(repo.database, options.project) // TODO: Add repo.findProject()
      if (!targetParent) {
        console.error(term.red(`Project not found: ${options.project}`))
        process.exit(1)
      }
      targetParentId = targetParent.id
    } else if (parentArg) {
      // Resolve parent path argument
      const resolvedParent = resolvePathArg(parentArg, resolvedNode.repoRoot)
      const parentRef = resolvedParent.nodeRef
      if (!parentRef) {
        console.error(term.red(`Cannot use a directory as parent`))
        process.exit(1)
      }
      // Find parent by ID/path/filename (parentRef validated above)
      targetParent = repo.resolveNode(parentRef)
      if (!targetParent) {
        console.error(term.red(`Parent not found: ${parentArg}`))
        process.exit(1)
      }
      targetParentId = targetParent.id
    } else {
      console.error(term.red("Specify a parent, --project, or --root"))
      process.exit(1)
    }

    // Don't move to self
    if (targetParentId === node.id) {
      console.error(term.red("Cannot move a node to itself"))
      process.exit(1)
    }

    // Don't move to current parent (no-op)
    if (targetParentId === node.parent_id) {
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

    // --dry-run: compute the rewrite preview without applying anything.
    // Uses `getRenameImpact` (already on the public Repo surface) so the
    // dry-run shares the exact same backlink walker the real move uses.
    // CI-gateable invariant: dry-run NEVER calls a mutation method.
    if (options.dryRun) {
      const impact = repo.getRenameImpact(node.id)
      const nodeName = getNodeDisplayName(node)
      const targetName = targetParent ? getNodeDisplayName(targetParent) : "(root)"
      if (options.json) {
        console.log(
          JSON.stringify({
            dryRun: true,
            id: node.id,
            from: { name: nodeName, parent_id: node.parent_id, fs_path: node.fs_path },
            to: { name: nodeName, parent_id: targetParentId },
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
      console.log(`Would move ${nodeName} → ${targetName}`)
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

    // Move via the canonical primitive — rewrites incoming references by
    // default unless `--no-rewrite` is set. See hub/km/design/move-rewrite-refs.md.
    // targetParentId may be null (--to-root); MoveSpec accepts null explicitly.
    const result = repo.moveNodeWithRefs(
      node.id,
      { newParentId: targetParentId },
      { noRewrite: options.rewrite === false },
    )

    if (options.json) {
      console.log(
        JSON.stringify({
          id: node.id,
          parent_id: targetParentId,
          rewroteHosts: result.rewroteHosts,
          rewroteRefs: result.rewroteRefs,
        }),
      )
      return
    }

    const nodeName = getNodeDisplayName(node)
    const targetName = targetParent ? getNodeDisplayName(targetParent) : "(root)"

    const refsSuffix =
      result.rewroteRefs > 0
        ? ` (rewrote ${result.rewroteRefs} ref${result.rewroteRefs === 1 ? "" : "s"} in ${result.rewroteHosts} file${result.rewroteHosts === 1 ? "" : "s"})`
        : ""
    console.log(term.green("→"), `Moved ${nodeName} to ${targetName}${refsSuffix}`)
  })

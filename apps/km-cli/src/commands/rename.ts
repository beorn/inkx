/**
 * `km rename` — Move-as-Rename Alias
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: per the design's tension #11
 * (rename vs move), `move` is canonical. `km move <node> <target>`
 * polymorphically dispatches: existing-id → reparent; new path-form id
 * → rename + ref-rewrite. `km rename` exists as an ergonomic alias
 * for muscle memory (bd / git users expect "rename") — it delegates to
 * `repo.moveNodeWithRefs` directly via the same underlying engine that
 * `km move` uses. One ref-rewrite engine, two surfaces — no
 * divergence by construction.
 *
 * For the actual rename (changing the canonical id), the storage-layer
 * primitive is `moveNodeWithRefs(id, { newId: ... })` — see
 * `@km/storage/move-with-rewrite-refs`. When that ships full id-rewrite,
 * this command will pass `{ newId }` instead of `{ newParentId }`.
 * Today (the engine ships reparent + ref-rewrite; id-rewrite is in
 * flight per the bead), we treat the second argument the same way
 * `km move` does — resolving as a target node — so muscle-memory
 * users get the behavior they expect.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { getNodeDisplayName } from "@km/tree"

export const renameCommand = new Command("rename")
  .description("Rename / reparent a node (alias of `km move`; uses the same ref-rewrite engine)")
  .argument("<id>", "Node to rename (ID, path, or filename)")
  .argument("<target>", "Target: existing node id (reparent) or new path-form id (rename)")
  .option("--no-rewrite", "Skip rewriting incoming references")
  .option("--json", "Output as JSON")
  .action(async (idArg: string, targetArg: string, options: { rewrite?: boolean; json?: boolean }) => {
    const resolvedNode = resolvePathArg(idArg, getRootPath())
    using repo = await loadRepo(resolvedNode.repoRoot)

    const nodeRef = resolvedNode.nodeRef ?? idArg
    const node = repo.resolveNode(nodeRef)
    if (!node) {
      console.error(term.red(`Node not found: ${idArg}`))
      process.exit(1)
    }

    // Polymorphic dispatch (one ref-rewrite engine):
    //   existing target → reparent (newParentId)
    //   non-existing target → rename (newId; falls back to reparent for
    //     today's engine until id-rewrite lands)
    const targetNode = repo.resolveNode(targetArg) ?? repo.resolveByName(targetArg)

    if (targetNode) {
      // Reparent path. Mirrors `km move`'s engine call.
      if (targetNode.id === node.id) {
        console.error(term.red("Cannot rename a node onto itself"))
        process.exit(1)
      }
      if (targetNode.id === node.parent_id) {
        if (options.json) {
          console.log(JSON.stringify({ id: node.id, parent_id: targetNode.id, unchanged: true }))
          return
        }
        console.log(term.yellow("Node is already at this location"))
        return
      }
      const result = repo.moveNodeWithRefs(
        node.id,
        { newParentId: targetNode.id },
        { noRewrite: options.rewrite === false },
      )
      if (options.json) {
        console.log(
          JSON.stringify({
            id: node.id,
            parent_id: targetNode.id,
            rewroteHosts: result.rewroteHosts,
            rewroteRefs: result.rewroteRefs,
          }),
        )
        return
      }
      const refsSuffix =
        result.rewroteRefs > 0
          ? ` (rewrote ${result.rewroteRefs} ref${result.rewroteRefs === 1 ? "" : "s"} in ${result.rewroteHosts} file${result.rewroteHosts === 1 ? "" : "s"})`
          : ""
      console.log(term.green("→"), `Moved ${getNodeDisplayName(node)} to ${getNodeDisplayName(targetNode)}${refsSuffix}`)
      return
    }

    // Rename path: target doesn't exist as a node. Today's engine
    // doesn't yet support `{ newId }` (that's `@km/storage/move-with-rewrite-refs`
    // in flight); error explicitly so users hit a clear failure rather
    // than silent no-op.
    console.error(
      term.red(
        `Target not found: ${targetArg}\n` +
          `Note: pure rename (changing the canonical id) requires @km/storage/move-with-rewrite-refs to land.\n` +
          `For now, pass an existing node as the target to reparent, or use 'km move' directly.`,
      ),
    )
    process.exit(1)
  })

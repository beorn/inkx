/**
 * `km children` — Discoverability Alias
 *
 * Wave 4/6 of `@km/cli/task-bd-collapse`: ergonomic alias of
 * `km show <id> -c`. "Show me the children" reads more naturally as
 * `km children <id>`.
 *
 * Walks BOTH the structural parent_id children AND the path-form
 * sibling-folder children (`@km/scope/foo.md` ↔ `@km/scope/foo/`).
 * For nodes that look like beads (have a path-form id), defers to
 * `Bead.children` which knows the sibling-folder shape; for non-bead
 * nodes, falls back to `repo.getChildren` (structural parent_id only).
 *
 * The Wave 6 lift: previously bd-children carried this Bead.children
 * walker; km-children was structural-only. Now km-children covers
 * both, letting bd-children collapse to a thin alias shim.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { Bead, buildDependentCountMap } from "@km/beads"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { formatNodeBrief } from "@km/tui"
import type { KNode } from "@km/core"
import { resolveShortId, formatAmbiguityError } from "../utils/short-id.ts"
import { emitJson, normalizeJsonJq } from "../utils/jq.ts"

export const childrenCommand = new Command("children")
  .description("Show the children of a node (alias of `km show <id> -c`; walks bead sibling folders too)")
  .argument("<id>", "Node ID, path, or filename")
  .option("--json", "Output as JSON")
  .option("--jq <expr>", "Filter JSON output through jq (implies --json; requires `jq` in PATH)")
  .action(async (id: string, options: { json?: boolean; jq?: string }) => {
    const resolved = resolvePathArg(id, getRootPath())
    using repo = await loadRepo(resolved.repoRoot)

    if (!resolved.nodeRef) {
      console.error(term.red(`Cannot show a directory. Use 'km ls' to list contents.`))
      process.exit(1)
    }

    // Beads-aware id resolution: short-id (slug) → scope/slug → full path.
    // For path-form ids where BOTH a `.md` file and a `/` folder exist at
    // the same path, prefer the `.md` (the bead) since beads keep their
    // content in the file, not the folder.
    let node: KNode | null = null
    if (resolved.nodeRef.includes("/") && !resolved.nodeRef.endsWith(".md")) {
      node = repo.resolveNode(`${resolved.nodeRef}.md`)
    }
    if (!node) {
      const result = resolveShortId(repo, resolved.nodeRef)
      if (result.candidates.length > 0) {
        console.error(term.red(formatAmbiguityError(id, result.candidates)))
        process.exit(1)
      }
      node = result.node
    }
    if (!node) {
      console.error(term.red(`Node not found: ${id}`))
      process.exit(1)
    }

    // If the node looks like a bead (path-form id), use Bead.children —
    // it walks BOTH structural parent_id children AND the path-form
    // sibling-folder shape (@km/scope/foo.md ↔ @km/scope/foo/). For
    // non-bead nodes, repo.getChildren is structural-only.
    const bead = Bead.from(node, { repo })
    let children: KNode[]
    if (bead) {
      const dependentCountMap = buildDependentCountMap(repo)
      const childBeads = Bead.children(repo, bead, { dependentCountMap })
      children = childBeads
        .map((c) => repo.getNode(c.id))
        .filter((n): n is KNode => n !== null)
    } else {
      children = repo.getChildren(node.id)
    }

    const { json, jq } = normalizeJsonJq(options)
    if (json) {
      await emitJson({ node, children }, jq)
      return
    }

    if (children.length === 0) {
      console.log(term.dim("No children."))
      return
    }

    for (const child of children) {
      // For path-form children (file-backed beads), surface the canonical
      // id from data.id or fs_path so callers can grep / sed / pipe the
      // output. Falls back to the brief formatter when no canonical id
      // is present (inline nodes, ULID-only nodes).
      const data = child.data as Record<string, unknown> | undefined
      const canonicalId = (typeof data?.id === "string" && data.id) || (child.fs_path?.endsWith(".md") ? child.fs_path.slice(0, -3) : null)
      if (canonicalId) {
        console.log(`  ${canonicalId}${child.content ? term.dim(` — ${child.content.slice(0, 60)}`) : ""}`)
      } else {
        console.log(`  ${formatNodeBrief(child)}`)
      }
    }
  })

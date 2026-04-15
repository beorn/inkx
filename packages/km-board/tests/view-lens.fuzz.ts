/**
 * ViewLens Fuzz — Parent/Children Consistency
 *
 * Property-based fuzz covering the parent/children mutual-recursion surface
 * of createViewLens. Regenerates random trees with varied node shapes
 * (headings, items, blocks) at varied depths and rootIds, then asserts:
 *
 *   1. No exception thrown for any parent()/children() call on walkOrder.
 *   2. walkOrder terminates (no infinite loop in the mutual recursion).
 *   3. parent(child) === p implies child ∈ children(p) — bidirectional agreement.
 *   4. parent chain from any walk node terminates at rootId or null in ≤ depth hops.
 *   5. walkOrder visits every reachable node exactly once (no duplicates).
 *
 * Origin: two independent bugs in view-lens parent/children mutual recursion
 * shipped as a stack-overflow crash during zoom on renamed files
 * (km-tui.zoom-stack-overflow). The initial fix added parentInFlight re-entry
 * guard + chain-walk post-condition. This bead is the belt-and-suspenders
 * follow-up so future similar bugs assert immediately in dev rather than
 * crash at runtime.
 *
 * ## Running
 *
 * ```bash
 * FUZZ=1 bun vitest run packages/km-board/tests/view-lens.fuzz.ts
 * FUZZ_SEED=12345 FUZZ=1 bun vitest run packages/km-board/tests/view-lens.fuzz.ts
 * ```
 */

import { expect, describe } from "vitest"
import { test, gen, take } from "vimonkey"
import type { KNode } from "@km/core"
import { createViewLens, type ViewLensRepo } from "../src/view-lens.ts"

// =============================================================================
// Node factories
// =============================================================================

function heading(id: string, parentId: string | null, idx: number, content?: string): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdsection",
    parent_id: parentId,
    parent_idx: idx,
    content: content ?? id,
    title: content ?? id,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "v1",
  }
}

function paragraph(id: string, parentId: string | null, idx: number): KNode {
  return {
    id,
    type: "p",
    item: { list: "-" },
    parent_id: parentId,
    parent_idx: idx,
    content: id,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "v1",
  }
}

function createMockRepo(nodes: KNode[]): ViewLensRepo {
  const nodeMap = new Map<string, KNode>()
  for (const n of nodes) nodeMap.set(n.id, n)
  return {
    getNode: (id) => nodeMap.get(id) ?? null,
    getChildren: (parentId) =>
      nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx),
    getNodesBatch: (ids) => {
      const result = new Map<string, KNode>()
      for (const id of ids) {
        const n = nodeMap.get(id)
        if (n) result.set(id, n)
      }
      return result
    },
  }
}

// =============================================================================
// Tree generator
// =============================================================================

interface GeneratedTree {
  nodes: KNode[]
  allIds: string[]
}

/**
 * Generate a random tree with `nCols` columns, each with up to `maxCards` cards,
 * each with up to `maxDepth` levels of nested subitems. Mixes heading and
 * paragraph node types so role classification is exercised.
 */
function genTree(opts: { nCols: number; maxCards: number; maxDepth: number; seed: number }): GeneratedTree {
  const { nCols, maxCards, maxDepth, seed } = opts
  let rnd = seed
  const pick = (n: number) => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
    return rnd % n
  }

  const nodes: KNode[] = [heading("root", null, 0)]
  const allIds: string[] = ["root"]
  let counter = 0
  const nextId = () => `n${counter++}`

  function buildSubtree(parent: string, depth: number, idx: number): void {
    const id = nextId()
    allIds.push(id)
    // Mix heading (outline) and paragraph (list item) nodes
    const useHeading = pick(2) === 0
    nodes.push(useHeading ? heading(id, parent, idx) : paragraph(id, parent, idx))
    if (depth >= maxDepth) return
    const nChildren = pick(3) // 0–2 sub-items
    for (let i = 0; i < nChildren; i++) {
      buildSubtree(id, depth + 1, i)
    }
  }

  for (let c = 0; c < nCols; c++) {
    const colId = `col${c}`
    allIds.push(colId)
    nodes.push(heading(colId, "root", c, `Col ${c}`))
    const nCards = 1 + pick(maxCards)
    for (let i = 0; i < nCards; i++) {
      buildSubtree(colId, 1, i)
    }
  }

  return { nodes, allIds }
}

// =============================================================================
// Invariants
// =============================================================================

/** Check invariants on a constructed lens. Throws on violation with descriptive message. */
function checkConsistency(lens: ReturnType<typeof createViewLens>, label: string, maxWalkHops = 10_000): void {
  // Invariant 1+2: walkOrder computes without exception and terminates
  const walk = lens.walkOrder
  if (walk.length > maxWalkHops) {
    throw new Error(`[${label}] walkOrder length ${walk.length} exceeds ${maxWalkHops}`)
  }

  // Invariant 5: walkOrder has no duplicates
  const seen = new Set<string>()
  for (const id of walk) {
    if (seen.has(id)) {
      throw new Error(`[${label}] walkOrder contains duplicate: ${id}`)
    }
    seen.add(id)
  }

  // Invariant 3: parent(child) === p implies child ∈ children(p)
  for (const id of walk) {
    const p = lens.parent(id)
    if (p === null) continue
    const pChildren = lens.children(p)
    if (!pChildren.includes(id)) {
      throw new Error(
        `[${label}] bidirectional mismatch: parent(${id}) = ${p} but children(${p}) = [${pChildren.join(",")}]`,
      )
    }
  }

  // Invariant 4: parent chain terminates in ≤ walk.length hops
  for (const id of walk) {
    let cur: string | null = id
    let hops = 0
    while (cur !== null && hops <= walk.length + 1) {
      cur = lens.parent(cur)
      hops++
    }
    if (hops > walk.length + 1) {
      throw new Error(`[${label}] parent chain from ${id} did not terminate in ${walk.length + 1} hops`)
    }
  }
}

// =============================================================================
// Fuzz properties
// =============================================================================

describe("view-lens fuzz", () => {
  test.fuzz("parent/children consistency holds for random trees", async () => {
    for await (const params of take(
      gen(({ random }) => ({
        nCols: 1 + Math.floor(random.float() * 4),
        maxCards: 1 + Math.floor(random.float() * 4),
        maxDepth: 1 + Math.floor(random.float() * 3),
        seed: Math.floor(random.float() * 100_000),
      })),
      100,
    )) {
      const tree = genTree(params)
      const repo = createMockRepo(tree.nodes)
      const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

      checkConsistency(lens, `seed=${params.seed}`)

      for (const id of lens.walkOrder) {
        expect(() => lens.parent(id)).not.toThrow()
      }
    }
  })

  test.fuzz("parent/children consistency survives zoom to any node", async () => {
    // Exercises rootId=X for every generated node, catching chain-walk
    // guard failures for cards whose lens role depends on ancestor computation.
    for await (const seed of take(
      gen(({ random }) => Math.floor(random.float() * 100_000)),
      30,
    )) {
      const tree = genTree({ nCols: 2, maxCards: 2, maxDepth: 2, seed })
      const repo = createMockRepo(tree.nodes)

      for (const rootId of tree.allIds) {
        const lens = createViewLens(repo, { rootId, foldDepths: new Map() })
        checkConsistency(lens, `seed=${seed} root=${rootId}`)
      }
    }
  })

  test.fuzz("every walk node is reachable via children() walk from lens root", async () => {
    // Strongest check — catches cases where parent() returns an ancestor
    // whose children() computation doesn't include the child (the exact
    // bug from km-tui.zoom-stack-overflow where embed mismatch caused
    // parent() to return an ancestor that didn't list the node in children()).
    for await (const seed of take(
      gen(({ random }) => Math.floor(random.float() * 100_000)),
      50,
    )) {
      const tree = genTree({ nCols: 3, maxCards: 3, maxDepth: 2, seed })
      const repo = createMockRepo(tree.nodes)
      const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

      const reachable = new Set<string>()
      const stack: string[] = ["root"]
      while (stack.length > 0) {
        const id = stack.pop()!
        if (reachable.has(id)) continue
        reachable.add(id)
        for (const ch of lens.children(id)) stack.push(ch)
      }

      for (const id of lens.walkOrder) {
        expect(reachable.has(id), `seed=${seed}: walkOrder node ${id} not reachable from root via children()`).toBe(
          true,
        )
      }
    }
  })
})

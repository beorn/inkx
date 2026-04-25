/**
 * Pane layout drag-move ops — unit tests for pure tree functions.
 *
 * Bead: km-silvercode.pane-drag-move
 *
 * Covers swapLeaves, moveLeafTo (4 directions + the source/target
 * symmetry), and findNeighbor (left/right/up/down across nested splits).
 */

import { describe, expect, test } from "vitest"
import {
  type LayoutNode,
  findNeighbor,
  leafIds,
  leafTree,
  moveLeafTo,
  splitLeaf,
  swapLeaves,
} from "../src/pane-layout.ts"

// ---- builders ----

function row(a: LayoutNode, b: LayoutNode, weight = 0.5): LayoutNode {
  return { kind: "split", direction: "row", children: [a, b], weight }
}

function col(a: LayoutNode, b: LayoutNode, weight = 0.5): LayoutNode {
  return { kind: "split", direction: "column", children: [a, b], weight }
}

function leaf(id: string): LayoutNode {
  return leafTree(id)
}

// ---- swapLeaves ----

describe("swapLeaves", () => {
  test("swaps two adjacent leaves in a row-split", () => {
    const tree = row(leaf("A"), leaf("B"))
    const next = swapLeaves(tree, "A", "B")
    expect(leafIds(next)).toEqual(["B", "A"])
  })

  test("swaps two leaves in different subtrees", () => {
    // [A | [B / C]]  →  swap(A, C)  →  [C | [B / A]]
    const tree = row(leaf("A"), col(leaf("B"), leaf("C")))
    const next = swapLeaves(tree, "A", "C")
    expect(leafIds(next)).toEqual(["C", "B", "A"])
  })

  test("no-op when ids equal", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(swapLeaves(tree, "A", "A")).toBe(tree)
  })

  test("preserves split direction and weight", () => {
    const tree = row(leaf("A"), leaf("B"), 0.7)
    const next = swapLeaves(tree, "A", "B")
    expect(next.kind).toBe("split")
    if (next.kind === "split") {
      expect(next.direction).toBe("row")
      expect(next.weight).toBe(0.7)
    }
  })
})

// ---- moveLeafTo ----

describe("moveLeafTo", () => {
  test("right edge — source becomes target's right neighbor", () => {
    // [A | [B / C]]  →  move A right of C  →  [B / [C | A]]
    const tree = row(leaf("A"), col(leaf("B"), leaf("C")))
    const next = moveLeafTo(tree, "A", "C", "right")
    // After remove(A) → [B / C]; split C row with A right → [B / [C | A]]
    expect(leafIds(next)).toEqual(["B", "C", "A"])
  })

  test("left edge — source becomes target's left neighbor", () => {
    const tree = row(leaf("A"), col(leaf("B"), leaf("C")))
    const next = moveLeafTo(tree, "A", "C", "left")
    expect(leafIds(next)).toEqual(["B", "A", "C"])
  })

  test("bottom edge — source becomes target's bottom neighbor", () => {
    // [A | B]  →  move A bottom of B  →  [B / A]
    const tree = row(leaf("A"), leaf("B"))
    const next = moveLeafTo(tree, "A", "B", "bottom")
    expect(next.kind).toBe("split")
    if (next.kind === "split") {
      expect(next.direction).toBe("column")
      expect(leafIds(next)).toEqual(["B", "A"])
    }
  })

  test("top edge — source becomes target's top neighbor", () => {
    const tree = row(leaf("A"), leaf("B"))
    const next = moveLeafTo(tree, "A", "B", "top")
    expect(next.kind).toBe("split")
    if (next.kind === "split") {
      expect(next.direction).toBe("column")
      expect(leafIds(next)).toEqual(["A", "B"])
    }
  })

  test("no-op when source equals target", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(moveLeafTo(tree, "A", "A", "right")).toBe(tree)
  })

  test("no-op when an id is missing", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(moveLeafTo(tree, "X", "B", "right")).toBe(tree)
    expect(moveLeafTo(tree, "A", "X", "right")).toBe(tree)
  })

  test("collapses parent split after removal", () => {
    // [[A / B] | C]  →  move A right of C  →  [B | [C | A]]
    // After remove(A): the col-split [A/B] collapses to just B; then
    // split C row → [B | [C | A]]
    const tree = row(col(leaf("A"), leaf("B")), leaf("C"))
    const next = moveLeafTo(tree, "A", "C", "right")
    expect(leafIds(next)).toEqual(["B", "C", "A"])
  })
})

// ---- findNeighbor ----

describe("findNeighbor", () => {
  test("right neighbor in a simple row-split", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(findNeighbor(tree, "A", "right")).toBe("B")
    expect(findNeighbor(tree, "B", "right")).toBeNull()
  })

  test("left neighbor in a simple row-split", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(findNeighbor(tree, "B", "left")).toBe("A")
    expect(findNeighbor(tree, "A", "left")).toBeNull()
  })

  test("down neighbor in a column-split", () => {
    const tree = col(leaf("A"), leaf("B"))
    expect(findNeighbor(tree, "A", "down")).toBe("B")
    expect(findNeighbor(tree, "B", "down")).toBeNull()
  })

  test("up neighbor in a column-split", () => {
    const tree = col(leaf("A"), leaf("B"))
    expect(findNeighbor(tree, "B", "up")).toBe("A")
    expect(findNeighbor(tree, "A", "up")).toBeNull()
  })

  test("right neighbor descends into nested subtree's left edge", () => {
    // [A | [B / C]]  — A's right neighbor walks into [B/C], approaching
    // the left edge: there's no row-split there so we pick children[0]
    // (B is at the top of the column-split).
    const tree = row(leaf("A"), col(leaf("B"), leaf("C")))
    expect(findNeighbor(tree, "A", "right")).toBe("B")
  })

  test("right neighbor across nested row-splits picks left edge", () => {
    // [A | [B | C]]  →  A's right neighbor is B (leftmost of right tree).
    const tree = row(leaf("A"), row(leaf("B"), leaf("C")))
    expect(findNeighbor(tree, "A", "right")).toBe("B")
  })

  test("up/down ignored when only row-splits present", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(findNeighbor(tree, "A", "up")).toBeNull()
    expect(findNeighbor(tree, "A", "down")).toBeNull()
  })

  test("returns null for missing leaf", () => {
    const tree = row(leaf("A"), leaf("B"))
    expect(findNeighbor(tree, "Z", "right")).toBeNull()
  })

  test("traverses up multiple levels to find a matching split", () => {
    // [[[A | B] | C] | D]  — A's right neighbor is B (immediate),
    // C's right is D, B's right is C.
    const tree = row(row(row(leaf("A"), leaf("B")), leaf("C")), leaf("D"))
    expect(findNeighbor(tree, "A", "right")).toBe("B")
    expect(findNeighbor(tree, "B", "right")).toBe("C")
    expect(findNeighbor(tree, "C", "right")).toBe("D")
    expect(findNeighbor(tree, "D", "right")).toBeNull()
  })
})

// ---- splitLeaf invariant guard (used by moveLeafTo) ----

describe("splitLeaf precondition for moveLeafTo", () => {
  test("splitLeaf places original first, new second by default", () => {
    const tree = leaf("T")
    const next = splitLeaf(tree, "T", "S", "row")
    expect(leafIds(next)).toEqual(["T", "S"])
  })
})

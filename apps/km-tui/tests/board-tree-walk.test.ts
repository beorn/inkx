/**
 * Regression: tree-walk helpers in board-app / board-actions-nav must terminate
 * on cyclic ViewTreeProjection.children(id) output.
 *
 * Embed cycles in the vault (file A embeds file B, file B embeds file A) make
 * the lens-projected children() return ancestor ids — pure recursive DFS without
 * a visited set hangs the JS event loop (Ctrl-C dead).
 *
 * See @km/tui/zoom-out-crash.
 */
import { describe, expect, it } from "vitest"
import { findDescendantPath, collectTreeDescendants } from "../src/board/board-tree-walk.ts"

type Tree = { children(id: string): readonly string[] }

function tree(adjacency: Record<string, readonly string[]>): Tree {
  return {
    children(id: string) {
      return adjacency[id] ?? []
    },
  }
}

describe("findDescendantPath", () => {
  it("returns [] when root === target", () => {
    expect(findDescendantPath(tree({}), "a", "a")).toStrictEqual([])
  })

  it("returns null when target is null", () => {
    expect(findDescendantPath(tree({ a: ["b"] }), "a", null)).toBeNull()
  })

  it("returns the path for a reachable acyclic target", () => {
    const t = tree({ a: ["b", "c"], b: ["d", "e"], c: ["f"], e: ["g"] })
    expect(findDescendantPath(t, "a", "g")).toStrictEqual(["b", "e", "g"])
  })

  it("returns null for an unreachable target", () => {
    const t = tree({ a: ["b"], b: ["c"] })
    expect(findDescendantPath(t, "a", "z")).toBeNull()
  })

  it("terminates on a 2-cycle (A → B → A)", () => {
    const t = tree({ a: ["b"], b: ["a"] })
    // Without cycle protection, this hangs forever.
    expect(findDescendantPath(t, "a", "z")).toBeNull()
  })

  it("terminates on a self-cycle (A → A)", () => {
    const t = tree({ a: ["a"] })
    expect(findDescendantPath(t, "a", "z")).toBeNull()
  })

  it("terminates on a deep cycle (A → B → C → A)", () => {
    const t = tree({ a: ["b"], b: ["c"], c: ["a"] })
    expect(findDescendantPath(t, "a", "z")).toBeNull()
  })

  it("still finds the target inside a cyclic graph", () => {
    const t = tree({ a: ["b", "c"], b: ["a"], c: ["d"], d: ["c"] })
    expect(findDescendantPath(t, "a", "d")).toStrictEqual(["c", "d"])
  })

  it("does not leak visited state across calls", () => {
    const t = tree({ a: ["b"], b: ["c"] })
    expect(findDescendantPath(t, "a", "c")).toStrictEqual(["b", "c"])
    expect(findDescendantPath(t, "a", "c")).toStrictEqual(["b", "c"])
    expect(findDescendantPath(t, "a", "b")).toStrictEqual(["b"])
  })
})

describe("collectTreeDescendants", () => {
  it("collects a linear acyclic subtree", () => {
    const t = tree({ a: ["b"], b: ["c"] })
    expect(collectTreeDescendants(t, "a")).toStrictEqual(["a", "b", "c"])
  })

  it("collects a branching acyclic subtree (depth-first)", () => {
    const t = tree({ a: ["b", "c"], b: ["d"], c: ["e"] })
    expect(collectTreeDescendants(t, "a")).toStrictEqual(["a", "b", "d", "c", "e"])
  })

  it("terminates on a 2-cycle", () => {
    const t = tree({ a: ["b"], b: ["a"] })
    // Without cycle protection, this hangs forever.
    expect(collectTreeDescendants(t, "a")).toStrictEqual(["a", "b"])
  })

  it("terminates on a self-cycle", () => {
    const t = tree({ a: ["a"] })
    expect(collectTreeDescendants(t, "a")).toStrictEqual(["a"])
  })

  it("terminates on a deep cycle and visits each node once", () => {
    const t = tree({ a: ["b"], b: ["c"], c: ["a"] })
    expect(collectTreeDescendants(t, "a")).toStrictEqual(["a", "b", "c"])
  })
})

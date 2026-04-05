/**
 * ViewTree projection tests — per-node signals synced from lens.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createViewLens } from "../src/view-lens.ts"
import { createVisibleLens } from "../src/visible-lens.ts"
import { createViewTree } from "../src/view-tree-projection.ts"

function n(id: string, parentId: string | null, type: "h" | "p" = "h", extra: Record<string, unknown> = {}): any {
  return {
    id,
    type,
    parent_id: parentId,
    content: id,
    data: {},
    ...(type === "h" ? { item: {}, name: id, title: id, fstype: "mdsection" } : {}),
    ...extra,
  }
}

function makeLens(nodes: any[], rootId: string, opts?: { collapsed?: Set<string> }) {
  const repo = createFakeRepo({ nodes })
  const view = createViewLens(repo, { rootId, foldDepths: new Map() })
  return opts?.collapsed
    ? createVisibleLens(view, { collapsedNodes: opts.collapsed })
    : view
}

const BASIC = [
  n("board", null),
  n("col1", "board"),
  n("1a", "col1", "p"),
  n("1b", "col1", "p"),
  n("col2", "board"),
  n("2a", "col2", "p"),
]

describe("createViewTree", () => {
  test("track creates signal bag from lens", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    const proj = tree.track("col1")
    expect(proj).toBeDefined()
    expect(proj!.viewType()).toBe("column")
    expect(proj!.data()?.id).toBe("col1")
  })

  test("track returns undefined for non-existent nodes", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    expect(tree.track("nonexistent")).toBeUndefined()
  })

  test("getProjected returns undefined before track", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    expect(tree.getProjected("col1")).toBeUndefined()
  })

  test("getProjected returns bag after track", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)
    tree.track("col1")

    expect(tree.getProjected("col1")).toBeDefined()
  })

  test("sync updates only changed fields", () => {
    const nodes = [...BASIC]
    const repo = createFakeRepo({ nodes })
    const lens1 = createViewLens(repo, { rootId: "board", foldDepths: new Map() })
    const tree = createViewTree()
    tree.sync(lens1)
    const proj = tree.track("col1")!

    const childIdsBefore = proj.childIds()

    // Create lens with collapsed col1 → children change
    const lens2 = createVisibleLens(
      createViewLens(repo, { rootId: "board", foldDepths: new Map() }),
      { collapsedNodes: new Set(["col1"]) },
    )
    tree.sync(lens2)

    // childIds should have changed (collapsed = empty)
    expect(proj.childIds()).toEqual([])
    // viewType unchanged
    expect(proj.viewType()).toBe("column")
  })

  test("sync prunes nodes no longer in lens", () => {
    const nodes = [...BASIC]
    const repo = createFakeRepo({ nodes })
    const lens1 = createViewLens(repo, { rootId: "board", foldDepths: new Map() })
    const tree = createViewTree()
    tree.sync(lens1)
    tree.track("2a")

    // Lens with hidden col2 → 2a disappears
    const lens2 = createViewLens(repo, {
      rootId: "board",
      foldDepths: new Map(),
      hiddenNodeIds: new Set(["col2"]),
    })
    tree.sync(lens2)

    expect(tree.getProjected("2a")).toBeUndefined()
  })

  test("navigation: next/prev delegate to lens", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    expect(tree.next("col1")).toBeDefined()
    expect(tree.prev("col2")).toBeDefined()
  })

  test("walkOrder matches lens", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    expect(tree.walkOrder).toEqual(lens.walkOrder)
  })

  test("nodes() iterates all visible nodes", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    const all = [...tree.nodes()]
    expect(all.length).toBeGreaterThan(0)
    expect(all).toEqual([...lens.walkOrder])
  })

  test("nodes({ from }) iterates from a specific node", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    const fromCol2 = [...tree.nodes({ from: "col1" })]
    // Should NOT include col1 itself, starts from its successor
    expect(fromCol2[0]).not.toBe("col1")
    expect(fromCol2.length).toBeGreaterThan(0)
  })

  test("nodes({ reverse: true }) walks backward", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    const reversed = [...tree.nodes({ reverse: true })]
    const forward = [...tree.nodes()]
    expect(reversed).toEqual([...forward].reverse())
  })

  test("node/children/parent delegate to lens", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    expect(tree.node("col1")?.id).toBe("col1")
    expect(tree.children("board")).toContain("col1")
    expect(tree.parent("1a")).toBeDefined()
  })

  test("rootId reflects current lens", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    expect(tree.rootId).toBe("board")
  })

  test("viewType is correct for different depths", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    tree.track("col1")
    tree.track("1a")

    expect(tree.getProjected("col1")!.viewType()).toBe("column")
    expect(tree.getProjected("1a")!.viewType()).toBe("card")
  })

  test("display is the KNode itself (non-embed)", () => {
    const lens = makeLens(BASIC, "board")
    const tree = createViewTree()
    tree.sync(lens)

    const proj = tree.track("1a")!
    expect(proj.display()?.id).toBe("1a")
    expect(proj.isSymlink()).toBe(false)
  })
})

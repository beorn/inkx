/**
 * VisibleLens tests — collapse + filter over viewLens.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createViewLens } from "../src/view-lens.ts"
import { createVisibleLens } from "../src/visible-lens.ts"

/** Shorthand: create nodes array for createFakeRepo. Sets parent_id from nesting. */
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

function lens(nodes: any[], rootId: string, options?: { collapsed?: Set<string>; filter?: (n: any) => boolean }) {
  const repo = createFakeRepo({ nodes })
  const view = createViewLens(repo, { rootId, foldDepths: new Map() })
  return createVisibleLens(view, {
    collapsedNodes: options?.collapsed,
    cardFilter: options?.filter,
  })
}

describe("visibleLens", () => {
  const BASIC_NODES = [
    n("board", null),
    n("col1", "board"),
    n("1a", "col1", "p"),
    n("1b", "col1", "p"),
    n("col2", "board"),
    n("2a", "col2", "p"),
  ]

  test("no options — passes through viewLens unchanged", () => {
    const v = lens(BASIC_NODES, "board")
    expect(v.children("board")).toContain("col1")
    expect(v.children("board")).toContain("col2")
    expect(v.children("col1")).toContain("1a")
    expect(v.children("col1")).toContain("1b")
    expect(v.children("col2")).toContain("2a")
  })

  test("collapsed column — cards excluded from children", () => {
    const v = lens(BASIC_NODES, "board", { collapsed: new Set(["col1"]) })
    expect(v.children("board")).toContain("col1") // header stays
    expect(v.children("col1")).toEqual([]) // cards gone
  })

  test("collapsed column — walkOrder has header but no cards", () => {
    const v = lens(BASIC_NODES, "board", { collapsed: new Set(["col1"]) })
    const walk = v.walkOrder
    expect(walk).toContain("col1")
    expect(walk).not.toContain("1a")
    expect(walk).not.toContain("1b")
    expect(walk).toContain("col2")
    expect(walk).toContain("2a")
  })

  test("cardFilter excludes non-matching cards", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("keep-1", "col1", "p"),
      n("hide-1", "col1", "p"),
      n("keep-2", "col1", "p"),
    ]
    const v = lens(nodes, "board", { filter: (node: any) => node.id.startsWith("keep") })
    expect(v.children("col1")).toEqual(["keep-1", "keep-2"])
    expect(v.walkOrder).not.toContain("hide-1")
  })

  test("collapsed + filter combined", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("1a", "col1", "p"),
      n("col2", "board"),
      n("keep", "col2", "p"),
      n("hide", "col2", "p"),
    ]
    const v = lens(nodes, "board", {
      collapsed: new Set(["col1"]),
      filter: (node: any) => node.id !== "hide",
    })
    expect(v.children("col1")).toEqual([]) // collapsed
    expect(v.children("col2")).toEqual(["keep"]) // filtered
    expect(v.walkOrder).toContain("col1")
    expect(v.walkOrder).not.toContain("1a")
    expect(v.walkOrder).toContain("keep")
    expect(v.walkOrder).not.toContain("hide")
  })

  test("nextInWalk skips collapsed cards", () => {
    const v = lens(BASIC_NODES, "board", { collapsed: new Set(["col1"]) })
    expect(v.nextInWalk("col1")).toBe("col2")
  })

  test("prevInWalk skips collapsed cards", () => {
    const v = lens(BASIC_NODES, "board", { collapsed: new Set(["col1"]) })
    expect(v.prevInWalk("col2")).toBe("col1")
  })

  test("role/isBody/resolvedEmbed delegate to parent lens", () => {
    const v = lens(BASIC_NODES, "board")
    expect(v.role("col1")).toBe("column")
    expect(v.role("1a")).toBe("card")
    // 1a is type "p" (non-outline) — body extraction marks it as body content
    expect(v.isBody("1a")).toBe(true)
    expect(v.resolvedEmbed("1a")).toBeUndefined()
  })

  test("get returns KNode even for filtered-out cards", () => {
    const v = lens(BASIC_NODES, "board", { filter: () => false })
    // Filtered cards aren't in children/walkOrder but get() still returns them
    expect(v.get("1a")).toBeDefined()
    expect(v.get("1a")?.id).toBe("1a")
  })
})

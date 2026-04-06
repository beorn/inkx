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

function lens(
  nodes: any[],
  rootId: string,
  options?: { collapsed?: Set<string>; filter?: (n: any) => boolean; taskStatusFilter?: ReadonlySet<string> },
) {
  const repo = createFakeRepo({ nodes })
  const view = createViewLens(repo, { rootId, foldDepths: new Map() })
  return createVisibleLens(view, {
    collapsedNodes: options?.collapsed,
    cardFilter: options?.filter,
    taskStatusFilter: options?.taskStatusFilter,
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

  test("role/isBody/resolvedSymlink delegate to parent lens", () => {
    const v = lens(BASIC_NODES, "board")
    expect(v.role("col1")).toBe("column")
    expect(v.role("1a")).toBe("card")
    // 1a is type "p" (non-outline) — body extraction marks it as body content
    expect(v.isBody("1a")).toBe(true)
    expect(v.resolvedSymlink("1a")).toBeUndefined()
  })

  test("get returns KNode even for filtered-out cards", () => {
    const v = lens(BASIC_NODES, "board", { filter: () => false })
    // Filtered cards aren't in children/walkOrder but get() still returns them
    expect(v.get("1a")).toBeDefined()
    expect(v.get("1a")?.id).toBe("1a")
  })

  // =========================================================================
  // Task status filter tests
  // =========================================================================

  const TASK_NODES = [
    n("board", null),
    n("col1", "board"),
    n("todo-1", "col1", "p", { item: { task: { marker: "[ ]", status: "todo" } } }),
    n("done-1", "col1", "p", { item: { task: { marker: "[x]", status: "done" } } }),
    n("wip-1", "col1", "p", { item: { task: { marker: "[/]", status: "wip" } } }),
    n("col2", "board"),
    n("dropped-1", "col2", "p", { item: { task: { marker: "[-]", status: "dropped" } } }),
    n("heading-1", "col2", "p"), // non-task node — always passes filter
  ]

  test("taskStatusFilter hides done cards from children", () => {
    const v = lens(TASK_NODES, "board", {
      taskStatusFilter: new Set(["todo", "wip", "blocked"]),
    })
    const col1Children = v.children("col1")
    expect(col1Children).toContain("todo-1")
    expect(col1Children).toContain("wip-1")
    expect(col1Children).not.toContain("done-1")
  })

  test("taskStatusFilter empty set shows all cards", () => {
    const v = lens(TASK_NODES, "board", {
      taskStatusFilter: new Set<string>(),
    })
    // Empty set = no filtering
    expect(v.children("col1")).toContain("todo-1")
    expect(v.children("col1")).toContain("done-1")
    expect(v.children("col1")).toContain("wip-1")
    expect(v.children("col2")).toContain("dropped-1")
    expect(v.children("col2")).toContain("heading-1")
  })

  test("taskStatusFilter removes hidden cards from walkOrder", () => {
    const v = lens(TASK_NODES, "board", {
      taskStatusFilter: new Set(["todo"]),
    })
    const walk = v.walkOrder
    expect(walk).toContain("todo-1")
    expect(walk).not.toContain("done-1")
    expect(walk).not.toContain("wip-1")
    expect(walk).not.toContain("dropped-1")
    // Non-task heading always visible
    expect(walk).toContain("heading-1")
  })

  test("taskStatusFilter non-task nodes always pass through", () => {
    const v = lens(TASK_NODES, "board", {
      taskStatusFilter: new Set(["todo"]),
    })
    // heading-1 has no task status — should always be visible
    expect(v.children("col2")).toContain("heading-1")
  })

  test("taskStatusFilter filters at sub-item depth too", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("card-1", "col1", "p"),
      n("sub-todo", "card-1", "p", { item: { task: { marker: "[ ]", status: "todo" } } }),
      n("sub-done", "card-1", "p", { item: { task: { marker: "[x]", status: "done" } } }),
    ]
    const v = lens(nodes, "board", {
      taskStatusFilter: new Set(["todo"]),
    })
    const cardChildren = v.children("card-1")
    expect(cardChildren).toContain("sub-todo")
    expect(cardChildren).not.toContain("sub-done")
  })

  test("embed card filtered by source node's task status", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      // Embed card pointing to a done task in another column
      n("embed-1", "col1", "p", { symlink_to: "source-done" }),
      n("col2", "board"),
      // Source node — in the tree (under col2), accessible via get()
      n("source-done", "col2", "p", { item: { task: { marker: "[x]", status: "done" } } }),
    ]
    const v = lens(nodes, "board", {
      taskStatusFilter: new Set(["todo", "wip"]),
    })
    // embed-1 should be hidden because its source (source-done) is "done"
    expect(v.children("col1")).not.toContain("embed-1")
    // source-done itself should also be hidden
    expect(v.children("col2")).not.toContain("source-done")
  })

  test("taskStatusFilter derives status from marker when status field is missing", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      // Node with marker but no explicit status field
      n("marker-done", "col1", "p", { item: { task: { marker: "[x]" } } }),
      n("marker-todo", "col1", "p", { item: { task: { marker: "[ ]" } } }),
    ]
    const v = lens(nodes, "board", {
      taskStatusFilter: new Set(["todo"]),
    })
    expect(v.children("col1")).toContain("marker-todo")
    expect(v.children("col1")).not.toContain("marker-done")
  })

  test("taskStatusFilter + collapsed combined", () => {
    const v = lens(TASK_NODES, "board", {
      collapsed: new Set(["col1"]),
      taskStatusFilter: new Set(["todo"]),
    })
    // col1 is collapsed — no children regardless of taskStatus
    expect(v.children("col1")).toEqual([])
    // col2 applies task filter: dropped-1 hidden, heading-1 visible
    expect(v.children("col2")).not.toContain("dropped-1")
    expect(v.children("col2")).toContain("heading-1")
  })
})

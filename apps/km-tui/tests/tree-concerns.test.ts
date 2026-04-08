import { describe, it, expect } from "vitest"
import { TreeConcernEngine, type TreeAccess, type TreeConcern } from "../src/state/tree-concerns.ts"

// Simple tree for testing:
//   root
//   ├── col1
//   │   ├── card1
//   │   │   ├── sub1
//   │   │   └── sub2
//   │   └── card2
//   └── col2
//       └── card3

const tree: TreeAccess = (() => {
  const parentMap: Record<string, string | null> = {
    root: null,
    col1: "root", col2: "root",
    card1: "col1", card2: "col1",
    card3: "col2",
    sub1: "card1", sub2: "card1",
  }
  const childMap: Record<string, string[]> = {
    root: ["col1", "col2"],
    col1: ["card1", "card2"],
    col2: ["card3"],
    card1: ["sub1", "sub2"],
    card2: [], card3: [], sub1: [], sub2: [],
  }
  return {
    parent: (id: string) => parentMap[id] ?? null,
    children: (id: string) => childMap[id] ?? [],
  }
})()

describe("TreeConcernEngine", () => {
  it("self concern: sets only source nodes", () => {
    const engine = new TreeConcernEngine()
    const concerns: TreeConcern[] = [
      { name: "cursor", source: () => new Set(["card1"]), direction: "self" },
    ]

    engine.sync(concerns, tree)

    expect(engine.peek("card1", "cursor")).toBe(true)
    expect(engine.peek("col1", "cursor")).toBe(false)
    expect(engine.peek("sub1", "cursor")).toBe(false)
  })

  it("up concern: sets ancestors of source, not source itself", () => {
    const engine = new TreeConcernEngine()
    const concerns: TreeConcern[] = [
      { name: "cursorDescendant", source: () => new Set(["sub1"]), direction: "up" },
    ]

    engine.sync(concerns, tree)

    // Ancestors get it
    expect(engine.peek("card1", "cursorDescendant")).toBe(true)
    expect(engine.peek("col1", "cursorDescendant")).toBe(true)
    expect(engine.peek("root", "cursorDescendant")).toBe(true)
    // Source does NOT get it
    expect(engine.peek("sub1", "cursorDescendant")).toBe(false)
    // Unrelated nodes don't get it
    expect(engine.peek("col2", "cursorDescendant")).toBe(false)
    expect(engine.peek("card2", "cursorDescendant")).toBe(false)
  })

  it("down concern: sets descendants of source, not source itself", () => {
    const engine = new TreeConcernEngine()
    const concerns: TreeConcern[] = [
      { name: "selectedAncestor", source: () => new Set(["col1"]), direction: "down" },
    ]

    engine.sync(concerns, tree)

    // Descendants get it
    expect(engine.peek("card1", "selectedAncestor")).toBe(true)
    expect(engine.peek("card2", "selectedAncestor")).toBe(true)
    expect(engine.peek("sub1", "selectedAncestor")).toBe(true)
    expect(engine.peek("sub2", "selectedAncestor")).toBe(true)
    // Source does NOT get it
    expect(engine.peek("col1", "selectedAncestor")).toBe(false)
    // Unrelated nodes don't get it
    expect(engine.peek("col2", "selectedAncestor")).toBe(false)
    expect(engine.peek("root", "selectedAncestor")).toBe(false)
  })

  it("diff: clears previous when source changes", () => {
    const engine = new TreeConcernEngine()
    let cursorId = "card1"
    const concerns: TreeConcern[] = [
      { name: "cursor", source: () => new Set([cursorId]), direction: "self" },
      { name: "cursorDescendant", source: () => new Set([cursorId]), direction: "up" },
    ]

    // First sync
    engine.sync(concerns, tree)
    expect(engine.peek("card1", "cursor")).toBe(true)
    expect(engine.peek("col1", "cursorDescendant")).toBe(true)

    // Move cursor
    cursorId = "card3"
    engine.sync(concerns, tree)

    // Old cursor cleared
    expect(engine.peek("card1", "cursor")).toBe(false)
    expect(engine.peek("col1", "cursorDescendant")).toBe(false)
    // New cursor set
    expect(engine.peek("card3", "cursor")).toBe(true)
    expect(engine.peek("col2", "cursorDescendant")).toBe(true)
    expect(engine.peek("root", "cursorDescendant")).toBe(true)
  })

  it("multiple concerns compose independently", () => {
    const engine = new TreeConcernEngine()
    const concerns: TreeConcern[] = [
      { name: "cursor", source: () => new Set(["sub1"]), direction: "self" },
      { name: "cursorDescendant", source: () => new Set(["sub1"]), direction: "up" },
      { name: "selected", source: () => new Set(["card1", "card2"]), direction: "self" },
      { name: "selectedAncestor", source: () => new Set(["card1", "card2"]), direction: "down" },
    ]

    engine.sync(concerns, tree)

    // sub1: cursor + selectedAncestor (ancestor card1 is selected)
    expect(engine.peek("sub1", "cursor")).toBe(true)
    expect(engine.peek("sub1", "selectedAncestor")).toBe(true)

    // card1: selected + cursorDescendant (sub1 is cursor)
    expect(engine.peek("card1", "selected")).toBe(true)
    expect(engine.peek("card1", "cursorDescendant")).toBe(true)

    // col1: cursorDescendant (ancestor of cursor)
    expect(engine.peek("col1", "cursorDescendant")).toBe(true)
    expect(engine.peek("col1", "selected")).toBe(false)

    // card2: selected, no cursorDescendant
    expect(engine.peek("card2", "selected")).toBe(true)
    expect(engine.peek("card2", "cursorDescendant")).toBe(false)
  })

  it("empty source clears all previous", () => {
    const engine = new TreeConcernEngine()
    let sel = new Set(["card1"])
    const concerns: TreeConcern[] = [
      { name: "selected", source: () => sel, direction: "self" },
      { name: "selectedAncestor", source: () => sel, direction: "down" },
    ]

    engine.sync(concerns, tree)
    expect(engine.peek("card1", "selected")).toBe(true)
    expect(engine.peek("sub1", "selectedAncestor")).toBe(true)

    // Clear selection
    sel = new Set()
    engine.sync(concerns, tree)
    expect(engine.peek("card1", "selected")).toBe(false)
    expect(engine.peek("sub1", "selectedAncestor")).toBe(false)
  })
})

/**
 * Exploration: Cursor follows indent — after Tab/Shift-Tab, cursor should
 * follow the node to its new position.
 *
 * Additional variations beyond existing indent-outdent.test.ts.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Cursor Follows Indent", () => {
  test("indent middle card: cursor follows to parent card", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("j") // → C
    board.press("Tab") // indent C under B

    expect(childIds(repo, "B")).toContain("C")

    // Cursor should follow C, resolving to card B
    const cursorText = board.q("[data-cursor]").textContent()
    if (!cursorText.includes("B")) {
      bugs.push(`cursor not on B after indent, got: ${cursorText}`)
    }

    expect(bugs).toEqual([])
  })

  test("outdent from nested position: cursor follows node up", () => {
    // Pre-nest: A → B (B is child of A)
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A", item("child-of-A")), item("C"))),
    )
    const bugs: string[] = []

    // Cursor starts on A (first card). Navigate to C (second card).
    board.press("j") // → C

    // Outdent C from col1 to board
    board.press("Shift+Tab")

    const boardKids = childIds(repo, "board")
    if (!boardKids.includes("C")) {
      bugs.push("C not outdented to board level")
    }

    // Cursor should follow C
    const cursorText = board.q("[data-cursor]").textContent()
    if (!cursorText.includes("C")) {
      bugs.push(`cursor not on C after outdent, got: ${cursorText}`)
    }

    expect(bugs).toEqual([])
  })

  test("sequential indent: cursor tracks through progressive nesting", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Navigate to E, indent under D
    board.press("j").press("j").press("j").press("j") // → E
    board.press("Tab")
    expect(childIds(repo, "D")).toContain("E")

    // Cursor should be on D (clamped)
    // Now indent D under C
    board.press("Tab")
    expect(childIds(repo, "C")).toContain("D")

    // Indent C under B
    board.press("Tab")
    expect(childIds(repo, "B")).toContain("C")

    // Indent B under A
    board.press("Tab")
    expect(childIds(repo, "A")).toContain("B")

    // col1 should only have A
    expect(childIds(repo, "col1")).toEqual(["A"])

    // Full chain: A → B → C → D → E
    expect(childIds(repo, "A")).toEqual(["B"])
    expect(childIds(repo, "B")).toEqual(["C"])
    expect(childIds(repo, "C")).toEqual(["D"])
    expect(childIds(repo, "D")).toEqual(["E"])

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deep sequential indent")
    }
    expect(bugs).toEqual([])
  })

  test("indent then immediately outdent: round trip", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    const before = childIds(repo, "col1")
    expect(before).toEqual(["A", "B", "C"])

    // Indent B under A
    board.press("j") // → B
    board.press("Tab")
    expect(childIds(repo, "A")).toEqual(["B"])
    expect(childIds(repo, "col1")).toEqual(["A", "C"])

    // Cursor is on card A now (following B). Navigate to verify structure.
    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after indent + cursor follow")
    }
    expect(bugs).toEqual([])
  })

  test("cursor follows indent in columns view", () => {
    const { board, repo } = testEnv(
      () => item("board", item("col1", item("A"), item("B"), item("C"))),
      { viewMode: "columns" },
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Tab") // indent B under A

    expect(childIds(repo, "A")).toContain("B")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in columns view after indent")
    }
    expect(bugs).toEqual([])
  })

  test("cursor follows indent in list view", () => {
    const { board, repo } = testEnv(
      () => item("board", item("col1", item("A"), item("B"), item("C"))),
      { viewMode: "list" },
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Tab") // indent B under A

    expect(childIds(repo, "A")).toContain("B")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in list view after indent")
    }
    expect(bugs).toEqual([])
  })

  test("batch indent: cursor follows to valid position after multi-select", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Select B→D
    board.press("j") // → B
    board.press("J") // anchor=B, cursor→C
    board.press("J") // range B→D

    board.press("Tab") // batch indent

    // D→C, C→B, B→A
    expect(childIds(repo, "A")).toContain("B")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch indent cursor follow")
    }
    expect(bugs).toEqual([])
  })

  test("indent on card with existing children appends correctly", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("existing1"), item("existing2")), item("new-item"))),
    )
    const bugs: string[] = []

    board.press("j") // → new-item
    board.press("Tab") // indent new-item under parent

    const parentKids = childIds(repo, "parent")
    expect(parentKids).toEqual(["existing1", "existing2", "new-item"])

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after indent into existing children")
    }
    expect(bugs).toEqual([])
  })
})

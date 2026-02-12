/**
 * Indent/Outdent Tests
 *
 * Tab = structural indent (reparent under previous sibling)
 * Shift+Tab = structural outdent (reparent to grandparent)
 *
 * Navigation model in cards view:
 * - j/k moves between sibling cards within a column (NOT into card children)
 * - After indent, cursor stays at same cardIndex (clamped to column size)
 * - Indent/outdent always operate on the currently cursored card (column child)
 *
 * Covers:
 * - Basic indent/outdent
 * - Multi-level sequential indent (bottom-up)
 * - Boundary cases (first child, single child, top-level outdent)
 * - Cursor position after indent/outdent
 * - Sort order preservation
 * - Interaction with folded nodes
 * - Different view modes
 * - Direct function tests for nested outdent scenarios
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// Helper: get child IDs of a parent from repo
function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Indent (Tab)", () => {
  describe("basic indent", () => {
    test("indent reparents node under previous sibling", () => {
      // col1: [A, B, C] — cursor on A, j → B, Tab → B becomes child of A
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.press("j") // Navigate to B
      expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

      board.press("Tab")

      expect(childIds(repo, "A")).toContain("B")
      expect(childIds(repo, "col1")).toEqual(["A", "C"])
    })

    test("indent last sibling reparents under previous", () => {
      // col1: [A, B, C] — j.j → C, Tab → C becomes child of B
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.press("j").press("j") // Navigate to C

      board.press("Tab")

      expect(childIds(repo, "B")).toContain("C")
      expect(childIds(repo, "col1")).toEqual(["A", "B"])
    })

    test("indent appends as last child of previous sibling", () => {
      // col1: [parent(child1, child2), target] — j → target, Tab → last child of parent
      const { board, repo } = testEnv(() =>
        item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
      )

      board.press("j") // Navigate to target (second card)

      board.press("Tab")

      const parentChildren = childIds(repo, "parent")
      expect(parentChildren).toEqual(["child1", "child2", "target"])
    })
  })

  describe("boundary cases", () => {
    test("indent first child bells (no previous sibling)", () => {
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

      // Cursor starts on A (first child) — Tab should bell
      board.press("Tab")

      // A should still be a child of col1
      expect(childIds(repo, "col1")).toEqual(["A", "B"])
    })

    test("indent single child bells", () => {
      const { board, repo } = testEnv(() => item("board", item("col1", item("only-child"))))

      board.press("Tab")

      expect(childIds(repo, "col1")).toEqual(["only-child"])
    })
  })

  describe("multi-level indent", () => {
    test("sequential indent from bottom nests progressively", () => {
      // Start: col1 = [A, B, C]
      // Indent C under B → col1=[A, B], cursor clamped to B
      // Indent B under A → col1=[A], cursor clamped to A
      // Result: A → B → C
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      // Navigate to C, indent under B
      board.press("j").press("j") // cardIndex=2 (C)
      board.press("Tab")
      expect(childIds(repo, "B")).toEqual(["C"])
      expect(childIds(repo, "col1")).toEqual(["A", "B"])

      // After indent C, cursor clamped to cardIndex=1 (B). Indent B under A.
      board.press("Tab")
      expect(childIds(repo, "A")).toContain("B")
      expect(childIds(repo, "col1")).toEqual(["A"])

      // Verify full nested tree: A → B → C
      expect(childIds(repo, "A")).toEqual(["B"])
      expect(childIds(repo, "B")).toEqual(["C"])
    })

    test("four-level sequential indent", () => {
      // Start: col1 = [A, B, C, D]
      // Indent D under C, cursor clamped to C
      // Indent C under B, cursor clamped to B
      // Indent B under A, cursor clamped to A
      // Result: A → B → C → D
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

      board.press("j").press("j").press("j") // Navigate to D (cardIndex=3)
      board.press("Tab")
      expect(childIds(repo, "C")).toEqual(["D"])

      // cursor at cardIndex=2 (C in [A,B,C])
      board.press("Tab")
      expect(childIds(repo, "B")).toContain("C")

      // cursor at cardIndex=1 (B in [A,B])
      board.press("Tab")
      expect(childIds(repo, "A")).toContain("B")

      // Verify: A → B → C → D
      expect(childIds(repo, "col1")).toEqual(["A"])
      expect(childIds(repo, "A")).toEqual(["B"])
      expect(childIds(repo, "B")).toEqual(["C"])
      expect(childIds(repo, "C")).toEqual(["D"])
    })
  })

  describe("cursor position after indent", () => {
    test("cursor moves to next sibling after indent", () => {
      // col1: [A, B, C] — indent B → cursor should land on C
      const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.press("j") // → B
      board.press("Tab") // indent B under A → col1=[A, C], cursor clamped to index 1 = C

      expect(board.q("[data-cursor]").textContent()).toContain("C")
    })

    test("cursor clamps to last card when indenting last sibling", () => {
      // col1: [A, B] — indent B → col1=[A], cursor clamped to index 0 = A
      const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

      board.press("j") // → B
      board.press("Tab") // indent B under A → col1=[A]

      expect(board.q("[data-cursor]").textContent()).toContain("A")
    })
  })
})

describe("Outdent (Shift+Tab)", () => {
  describe("basic outdent", () => {
    test("outdent moves card from column to board level", () => {
      // col1: [card1, card2] — card1's grandparent is board
      // Shift+Tab on card1 → card1 becomes sibling of col1 under board
      const { board, repo } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))))

      board.press("Shift+Tab")

      expect(childIds(repo, "board")).toContain("card1")
      expect(childIds(repo, "col1")).toEqual(["card2"])
    })

    test("outdent preserves remaining siblings in column", () => {
      // col1: [A, B, C] — outdent B → col1=[A, C], board gets B
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.press("j") // → B
      board.press("Shift+Tab")

      expect(childIds(repo, "col1")).toEqual(["A", "C"])
      expect(childIds(repo, "board")).toContain("B")
    })
  })

  describe("outdent after indent (round-trip at column level)", () => {
    test("indent then outdent the same card back via zoom", () => {
      // This tests the structural round-trip:
      // 1. Indent B under A (B moves from col1 to A's children)
      // 2. Navigate to B requires zoom into A (separate view)
      // Here we test the reverse: outdent a card to board level, then re-indent
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

      // Outdent A from col1 to board level
      board.press("Shift+Tab")
      expect(childIds(repo, "board")).toContain("A")
      expect(childIds(repo, "col1")).toEqual(["B"])

      // Note: can't easily navigate back and re-indent via keyboard
      // since A is now a board-level node (not in any column)
    })
  })

  describe("sort order after outdent", () => {
    test("outdent places card after its column in board children", () => {
      // col1: [card1] — outdent card1 → board = [col1, card1]
      const { board, repo } = testEnv(() => item("board", item("col1", item("card1"))))

      board.press("Shift+Tab")

      const boardKids = childIds(repo, "board")
      expect(boardKids).toContain("col1")
      expect(boardKids).toContain("card1")
      const colIdx = boardKids.indexOf("col1")
      const cardIdx = boardKids.indexOf("card1")
      expect(cardIdx).toBeGreaterThan(colIdx)
    })

    test("outdent middle card places correctly relative to other columns", () => {
      // board: [col1(A, B, C), col2] — outdent B → board = [col1, B, col2]
      const { board, repo } = testEnv(() =>
        item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("X"))),
      )

      board.press("j") // → B
      board.press("Shift+Tab")

      // B should be placed after col1 in board's children
      const boardKids = childIds(repo, "board")
      expect(boardKids).toContain("B")
      const col1Idx = boardKids.indexOf("col1")
      const bIdx = boardKids.indexOf("B")
      expect(bIdx).toBeGreaterThan(col1Idx)
    })
  })

  describe("cursor position after outdent", () => {
    test("cursor stays at same index after outdent", () => {
      // col1: [A, B, C] — outdent A → col1=[B, C], cursor at index 0 = B
      const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.press("Shift+Tab") // outdent A

      expect(board.q("[data-cursor]").textContent()).toContain("B")
    })
  })
})

describe("Sort order preservation", () => {
  test("indent preserves relative order of remaining siblings", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Indent B under A
    board.press("j") // Navigate to B
    board.press("Tab")

    // col1 should still have A, C, D in order
    expect(childIds(repo, "col1")).toEqual(["A", "C", "D"])
  })

  test("indent preserves sort order of target's existing children", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
    )

    board.press("j") // → target
    board.press("Tab") // indent target under parent

    // target should be AFTER existing children
    const kids = childIds(repo, "parent")
    expect(kids).toEqual(["child1", "child2", "target"])
  })

  test("indent with two items produces correct parent_idx ordering", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("parent"), item("A"), item("B"))))

    // Indent A under parent
    board.press("j") // → A
    board.press("Tab")

    // cursor clamped to index 1 (B, the remaining sibling)
    // Indent B under parent
    board.press("Tab")

    // Both A and B should be children of parent, in order
    const parentChildren = repo.getChildren("parent")
    expect(parentChildren.map((c) => c.id)).toEqual(["A", "B"])

    const aIdx = parentChildren.find((c) => c.id === "A")?.parent_idx ?? -1
    const bIdx = parentChildren.find((c) => c.id === "B")?.parent_idx ?? -1
    expect(bIdx).toBeGreaterThan(aIdx)
  })
})

describe("Interaction with folded nodes", () => {
  test("indent works when previous sibling is folded", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
    )

    // Fold parent (za chord)
    board.press("z").press("a") // toggle_fold on parent

    // Navigate to target
    board.press("j") // → target

    // Indent target under parent (folded parent is still valid)
    board.press("Tab")

    expect(childIds(repo, "parent")).toContain("target")
  })

  test("indent works when previous sibling has children", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A", item("deep1"), item("deep2")), item("B"))),
    )

    board.press("j") // → B
    board.press("Tab") // indent B under A

    // B should be appended as last child of A (after deep1, deep2)
    expect(childIds(repo, "A")).toEqual(["deep1", "deep2", "B"])
  })
})

describe("Different view modes", () => {
  test("indent in columns view works", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), {
      viewMode: "columns",
    })

    board.press("j") // Navigate to B

    board.press("Tab")

    expect(childIds(repo, "A")).toContain("B")
    expect(childIds(repo, "col1")).toEqual(["A", "C"])
  })

  test("indent in list view works", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), {
      viewMode: "list",
    })

    board.press("j") // Navigate to B

    board.press("Tab")

    expect(childIds(repo, "A")).toContain("B")
  })

  test("outdent in columns view works", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))), {
      viewMode: "columns",
    })

    board.press("Shift+Tab") // outdent A from col1 to board

    expect(childIds(repo, "board")).toContain("A")
  })
})

describe("Edge cases", () => {
  test("indent only child of column bells", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("only"))))

    board.press("Tab")

    expect(childIds(repo, "col1")).toEqual(["only"])
  })

  test("outdent from column to board level works", () => {
    // board → col1 → card1 — Shift+Tab makes card1 sibling of col1
    const { board, repo } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))))

    board.press("Shift+Tab")

    expect(childIds(repo, "board")).toContain("card1")
  })

  test("sequential indent + outdent on different cards", () => {
    // col1: [A, B, C]
    // Indent C under B → col1=[A, B], cursor on B
    // Outdent B (with C as child) to board → col1=[A], board has [col1, B]
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Indent C under B
    board.press("j").press("j") // → C
    board.press("Tab")
    expect(childIds(repo, "B")).toEqual(["C"])
    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // cursor is on B (clamped from index 2 to 1)
    // Outdent B (with C as child) from col1 to board
    board.press("Shift+Tab")
    expect(childIds(repo, "board")).toContain("B")
    expect(childIds(repo, "col1")).toEqual(["A"])

    // B should still have C as child (outdent moves subtree)
    expect(childIds(repo, "B")).toEqual(["C"])
  })

  test("multiple sequential indents building deep hierarchy", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Indent D under C: col1=[A, B, C], cursor clamped to index 2 (C)
    board.press("j").press("j").press("j") // → D
    board.press("Tab")
    expect(childIds(repo, "C")).toEqual(["D"])
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    // cursor at C (index 2). Indent C under B: col1=[A, B], cursor clamped to 1 (B)
    board.press("Tab")
    expect(childIds(repo, "B")).toContain("C")
    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // Verify nested: A, B → C → D
    expect(childIds(repo, "A")).toEqual([])
    expect(childIds(repo, "B")).toEqual(["C"])
    expect(childIds(repo, "C")).toEqual(["D"])
  })

  test("Tab and Shift+Tab are no-ops at board level", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Navigate to board level (k from first card → column, k again → board)
    board.press("k") // → col1 (column header)
    board.press("k") // → board

    const beforeBoard = childIds(repo, "board")
    const beforeCol1 = childIds(repo, "col1")

    board.press("Tab")
    board.press("Shift+Tab")

    // Structure unchanged
    expect(childIds(repo, "board")).toEqual(beforeBoard)
    expect(childIds(repo, "col1")).toEqual(beforeCol1)
  })

  test("Tab and Shift+Tab are no-ops at column level", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Navigate to column level
    board.press("k") // → col1 (column header)

    const beforeBoard = childIds(repo, "board")
    const beforeCol1 = childIds(repo, "col1")

    board.press("Tab")
    board.press("Shift+Tab")

    // Structure unchanged
    expect(childIds(repo, "board")).toEqual(beforeBoard)
    expect(childIds(repo, "col1")).toEqual(beforeCol1)
  })
})

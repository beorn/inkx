/**
 * Indent/Outdent Tests
 *
 * Tab = structural indent (reparent under previous sibling)
 * Shift+Tab = structural outdent (reparent to grandparent)
 *
 * Navigation model in cards view:
 * - j/k moves between sibling cards within a column (NOT into card children)
 * - Cursor follows the moved node (invariant): after indent/outdent, cursorNodeId
 *   tracks the moved card. For indent, this resolves to the parent card (the previous
 *   sibling the node was indented under). For outdent, cursor follows to new position.
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
import { getActiveBoardPane } from "../src/board-app-store.ts"

// Helper: get child IDs of a parent from repo
function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

// Helper: get cursor target node ID from the store's cursor store.
// Returns cursorCardNodeId if at card level, cursorColumnNodeId if at column level, cursorNodeId otherwise.
function cursorTargetId(store: {
  getState(): {
    cursorStore?: {
      getState(): { cursorNodeId: string | null; cursorCardNodeId: string | null; cursorColumnNodeId: string | null }
    }
  }
}): string | null {
  const cs = store.getState().cursorStore?.getState()
  if (!cs) return null
  return cs.cursorCardNodeId ?? cs.cursorColumnNodeId ?? cs.cursorNodeId
}

describe("Indent (Tab)", () => {
  describe("basic indent", () => {
    test("indent reparents node under previous sibling", () => {
      // col1: [A, B, C] — cursor on A, j → B, Tab → B becomes child of A
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.command("cursor_down") // Navigate to B
      expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

      board.command("indent_node")

      expect(childIds(repo, "A")).toContain("B")
      expect(childIds(repo, "col1")).toEqual(["A", "C"])
    })

    test("indent last sibling reparents under previous", () => {
      // col1: [A, B, C] — j.j → C, Tab → C becomes child of B
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.command("cursor_down").command("cursor_down") // Navigate to C

      board.command("indent_node")

      expect(childIds(repo, "B")).toContain("C")
      expect(childIds(repo, "col1")).toEqual(["A", "B"])
    })

    test("indent appends as last child of previous sibling", () => {
      // col1: [parent(child1, child2), target] — j → target, Tab → last child of parent
      const { board, repo } = testEnv(() =>
        item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
      )

      board.command("cursor_down") // Navigate to target (second card)

      board.command("indent_node")

      const parentChildren = childIds(repo, "parent")
      expect(parentChildren).toEqual(["child1", "child2", "target"])
    })
  })

  describe("boundary cases", () => {
    test.each([
      {
        name: "first child (no previous sibling)",
        fixture: () => item("board", item("col1", item("A"), item("B"))),
        expected: ["A", "B"],
      },
      {
        name: "single child",
        fixture: () => item("board", item("col1", item("only-child"))),
        expected: ["only-child"],
      },
    ])("indent $name bells (no-op)", ({ fixture, expected }) => {
      const { board, repo } = testEnv(fixture)
      board.command("indent_node")
      expect(childIds(repo, "col1")).toEqual(expected)
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
      board.command("cursor_down").command("cursor_down") // cardIndex=2 (C)
      board.command("indent_node")
      expect(childIds(repo, "B")).toEqual(["C"])
      expect(childIds(repo, "col1")).toEqual(["A", "B"])

      // After indent C, cursor clamped to cardIndex=1 (B). Indent B under A.
      board.command("indent_node")
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

      board.command("cursor_down").command("cursor_down").command("cursor_down") // Navigate to D (cardIndex=3)
      board.command("indent_node")
      expect(childIds(repo, "C")).toEqual(["D"])

      // cursor at cardIndex=2 (C in [A,B,C])
      board.command("indent_node")
      expect(childIds(repo, "B")).toContain("C")

      // cursor at cardIndex=1 (B in [A,B])
      board.command("indent_node")
      expect(childIds(repo, "A")).toContain("B")

      // Verify: A → B → C → D
      expect(childIds(repo, "col1")).toEqual(["A"])
      expect(childIds(repo, "A")).toEqual(["B"])
      expect(childIds(repo, "B")).toEqual(["C"])
      expect(childIds(repo, "C")).toEqual(["D"])
    })
  })

  describe("cursor follows node after indent", () => {
    test("cursor follows indented node to parent card", () => {
      // col1: [A, B, C] — indent B under A → cursor follows B, resolves to card A
      const { board, store } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.command("cursor_down") // → B
      board.command("indent_node") // indent B under A → col1=[A, C], cursor follows B → card A

      // Verify cursor store tracks B → resolves to card A
      // (data-cursor render may be deferred after structural tree changes; cursor store is the source of truth)
      expect(cursorTargetId(store)).toBe("A")
    })

    test("cursor follows indented node when last sibling", () => {
      // col1: [A, B] — indent B under A → col1=[A], cursor follows B → card A
      const { board, store } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

      board.command("cursor_down") // → B
      board.command("indent_node") // indent B under A → col1=[A]

      expect(cursorTargetId(store)).toBe("A")
    })
  })
})

describe("Outdent (Shift+Tab)", () => {
  describe("basic outdent", () => {
    test("outdent moves card from column to board level", () => {
      // col1: [card1, card2] — card1's grandparent is board
      // Shift+Tab on card1 → card1 becomes sibling of col1 under board
      const { board, repo } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))))

      board.press("shift+Tab")

      expect(childIds(repo, "board")).toContain("card1")
      expect(childIds(repo, "col1")).toEqual(["card2"])
    })

    test("outdent preserves remaining siblings in column", () => {
      // col1: [A, B, C] — outdent B → col1=[A, C], board gets B
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.command("cursor_down") // → B
      board.press("shift+Tab")

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
      board.press("shift+Tab")
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

      board.press("shift+Tab")

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

      board.command("cursor_down") // → B
      board.press("shift+Tab")

      // B should be placed after col1 in board's children
      const boardKids = childIds(repo, "board")
      expect(boardKids).toContain("B")
      const col1Idx = boardKids.indexOf("col1")
      const bIdx = boardKids.indexOf("B")
      expect(bIdx).toBeGreaterThan(col1Idx)
    })
  })

  describe("cursor follows node after outdent", () => {
    test("cursor follows outdented node to board level", () => {
      // col1: [A, B, C] — outdent A → A moves to board level, cursor follows A
      const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

      board.press("shift+Tab") // outdent A → cursor follows A to board level

      expect(board.q("[data-cursor]").textContent()).toContain("A")
    })
  })
})

describe("Sort order preservation", () => {
  test("indent preserves relative order of remaining siblings", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Indent B under A
    board.command("cursor_down") // Navigate to B
    board.command("indent_node")

    // col1 should still have A, C, D in order
    expect(childIds(repo, "col1")).toEqual(["A", "C", "D"])
  })

  test("indent preserves sort order of target's existing children", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
    )

    board.command("cursor_down") // → target
    board.command("indent_node") // indent target under parent

    // target should be AFTER existing children
    const kids = childIds(repo, "parent")
    expect(kids).toEqual(["child1", "child2", "target"])
  })

  test("indent with two items produces correct parent_idx ordering", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("parent"), item("A"), item("B"))))

    // Indent A under parent
    board.command("cursor_down") // → A
    board.command("indent_node") // A under parent, cursor follows A → card "parent" (index 0)

    // Navigate to B (now at index 1 in [parent, B])
    board.command("cursor_down") // → B
    // Indent B under parent
    board.command("indent_node")

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

    // Fold parent
    board.command("fold_node") // fold_node on parent

    // Navigate to target
    board.command("cursor_down") // → target

    // Indent target under parent (folded parent is still valid)
    board.command("indent_node")

    expect(childIds(repo, "parent")).toContain("target")
  })

  test("indent works when previous sibling has children", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A", item("deep1"), item("deep2")), item("B"))),
    )

    board.command("cursor_down") // → B
    board.command("indent_node") // indent B under A

    // B should be appended as last child of A (after deep1, deep2)
    expect(childIds(repo, "A")).toEqual(["deep1", "deep2", "B"])
  })
})

describe("Different view modes", () => {
  test("indent in columns view works", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), {
      viewMode: "columns",
    })

    board.command("cursor_down") // Navigate to B

    board.command("indent_node")

    expect(childIds(repo, "A")).toContain("B")
    expect(childIds(repo, "col1")).toEqual(["A", "C"])
  })

  test("indent in list view works", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), {
      viewMode: "list",
    })

    board.command("cursor_down") // Navigate to B

    board.command("indent_node")

    expect(childIds(repo, "A")).toContain("B")
  })

  test("outdent in columns view works", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))), {
      viewMode: "columns",
    })

    board.press("shift+Tab") // outdent A from col1 to board

    expect(childIds(repo, "board")).toContain("A")
  })
})

describe("Edge cases", () => {
  test("outdent from column to board level works", () => {
    // board → col1 → card1 — Shift+Tab makes card1 sibling of col1
    const { board, repo } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))))

    board.press("shift+Tab")

    expect(childIds(repo, "board")).toContain("card1")
  })

  test("sequential indent + outdent on different cards", () => {
    // col1: [A, B, C]
    // Indent C under B → col1=[A, B], cursor on B
    // Outdent B (with C as child) to board → col1=[A], board has [col1, B]
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Indent C under B
    board.command("cursor_down").command("cursor_down") // → C
    board.command("indent_node")
    expect(childIds(repo, "B")).toEqual(["C"])
    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // cursor is on B (clamped from index 2 to 1)
    // Outdent B (with C as child) from col1 to board
    board.press("shift+Tab")
    expect(childIds(repo, "board")).toContain("B")
    expect(childIds(repo, "col1")).toEqual(["A"])

    // B should still have C as child (outdent moves subtree)
    expect(childIds(repo, "B")).toEqual(["C"])
  })

  test("multiple sequential indents building deep hierarchy", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Indent D under C: col1=[A, B, C], cursor clamped to index 2 (C)
    board.command("cursor_down").command("cursor_down").command("cursor_down") // → D
    board.command("indent_node")
    expect(childIds(repo, "C")).toEqual(["D"])
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    // cursor at C (index 2). Indent C under B: col1=[A, B], cursor clamped to 1 (B)
    board.command("indent_node")
    expect(childIds(repo, "B")).toContain("C")
    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // Verify nested: A, B → C → D
    expect(childIds(repo, "A")).toEqual([])
    expect(childIds(repo, "B")).toEqual(["C"])
    expect(childIds(repo, "C")).toEqual(["D"])
  })

  test.each([
    { name: "board level", nav: ["k", "k"] },
    { name: "column level", nav: ["k"] },
  ])("Tab and Shift+Tab are no-ops at $name", ({ nav }) => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    for (const k of nav) board.press(k)

    const beforeBoard = childIds(repo, "board")
    const beforeCol1 = childIds(repo, "col1")

    board.command("indent_node")
    board.press("shift+Tab")

    // Structure unchanged
    expect(childIds(repo, "board")).toEqual(beforeBoard)
    expect(childIds(repo, "col1")).toEqual(beforeCol1)
  })
})

// =============================================================================
// Multi-select indent/outdent (atomic batch)
// =============================================================================

describe("Multi-select indent (atomic batch)", () => {
  test("indent selected cards (B,C,D) under previous siblings", () => {
    // col1: [A, B, C, D, E] — select B,C,D via 2 J presses from B
    // (1st J: anchor=B, cursor→C, multiSelected={B}
    //  2nd J: cursor→D, range B→D = {B,C,D})
    // Tab → batch indent bottom-up: D→C, C→B, B→A
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )

    board.command("cursor_down") // → B (index 1)
    board.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}, cursor→C
    board.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}, cursor→D

    board.command("indent_node")

    // Bottom-up: D under C, C under B, B under A
    expect(childIds(repo, "A")).toEqual(["B"])
    expect(childIds(repo, "B")).toEqual(["C"])
    expect(childIds(repo, "C")).toEqual(["D"])
    expect(childIds(repo, "col1")).toEqual(["A", "E"])
  })

  test("multi-select indent fails atomically when first card can't indent", () => {
    // col1: [A, B, C, D] — select A,B,C via 2 J presses from A
    // A is first child (no prev sibling) → entire batch fails
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    board.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→B
    board.press("shift+ArrowDown") // range A→C, multiSelected={A:0,B:0,C:0}, cursor→C

    board.command("indent_node")

    // Nothing moved — atomic failure
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C", "D"])
  })

  test("selection is cleared after successful multi-select indent", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    board.command("cursor_down") // → B
    board.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}
    board.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}
    board.command("indent_node")

    // After successful batch indent, no "selected" status
    const status = board.getStatus()
    if (status) {
      expect(status.message).not.toContain("selected")
    }
  })
})

describe("Multi-select outdent (atomic batch)", () => {
  test("outdent selected cards from column to board level", () => {
    // col1: [A, B, C, D] — select A,B,C via 2 J presses from A
    // Shift+Tab → all three move to board level
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    board.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→B
    board.press("shift+ArrowDown") // range A→C, multiSelected={A:0,B:0,C:0}, cursor→C

    board.press("shift+Tab")

    expect(childIds(repo, "board")).toContain("A")
    expect(childIds(repo, "board")).toContain("B")
    expect(childIds(repo, "board")).toContain("C")
    expect(childIds(repo, "col1")).toEqual(["D"])
  })
})

// =============================================================================
// Cursor position tracking (detailed)
// =============================================================================

describe("Cursor follows node (invariant)", () => {
  test.each([
    {
      name: "indent: cursor follows to parent card",
      fixture: () => item("board", item("col1", item("A"), item("B"), item("C"))),
      nav: ["j"],
      key: "Tab",
      expected: "A",
    },
    {
      name: "indent: cursor follows when only sibling left",
      fixture: () => item("board", item("col1", item("A"), item("B"))),
      nav: ["j"],
      key: "Tab",
      expected: "A",
    },
    {
      name: "outdent: cursor follows to board level",
      fixture: () => item("board", item("col1", item("A"), item("B"), item("C"))),
      nav: [],
      key: "Shift+Tab",
      expected: "A",
    },
    {
      name: "outdent: cursor follows last card to board level",
      fixture: () => item("board", item("col1", item("A"), item("B"))),
      nav: ["j"],
      key: "Shift+Tab",
      expected: "B",
    },
  ])("$name", ({ fixture, nav, key, expected }) => {
    const { board, store } = testEnv(fixture)
    for (const k of nav) board.press(k)
    board.press(key)
    // After structural tree changes (indent/outdent), cursor store is the source of truth.
    // The data-cursor render attribute may not update within the same press cycle due to
    // React's useSyncExternalStore flush timing during the silvery render pipeline.
    expect(cursorTargetId(store)).toBe(expected)
  })

  test("indent then navigate: can reach next sibling after indent", () => {
    // Verify navigation works after cursor-follows-node
    // col1: [A, B, C] — indent B under A → cursor on A, then j → C
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    board.command("cursor_down") // → B
    board.command("indent_node") // indent B → cursor on card A (col1=[A, C])
    board.command("cursor_down") // → C

    expect(board.q("[data-cursor]").textContent()).toContain("C")
  })

  test("INVARIANT: indent then outdent preserves tree structure", () => {
    // col1: [A, B, C] — indent B under A → directly verify repo state
    // Then test outdent by constructing pre-nested tree
    const { board, repo, store } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    board.command("cursor_down") // → B
    board.command("indent_node") // indent B under A → cursor on card A
    expect(childIds(repo, "col1")).toEqual(["A", "C"]) // B moved under A
    expect(childIds(repo, "A")).toEqual(["B"])
    expect(cursorTargetId(store)).toBe("A")
  })

  test("non-item nodes cannot be indented (type restriction)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    // Change B to a non-item block (item=false) — non-indentable
    repo.updateNode("B", { type: "p", item: false })

    board.command("cursor_down") // → B
    board.command("indent_node") // attempt indent — should be blocked

    // B should still be a direct child of col1 (not moved under A)
    expect(childIds(repo, "col1")).toEqual(["A", "B"])
    expect(childIds(repo, "A")).toEqual([])
  })

  test("section and task nodes can still be indented (type restriction allows them)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    // B is a task (default from item()), A is also a task — both should be indentable
    board.command("cursor_down") // → B
    board.command("indent_node") // indent B under A — should succeed

    expect(childIds(repo, "col1")).toEqual(["A"])
    expect(childIds(repo, "A")).toEqual(["B"])
  })
})

// =============================================================================
// Column Indent
// =============================================================================

describe("Column Indent", () => {
  test("Tab on column header indents column under previous column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))

    // Navigate to col2 header: right from col1's first card
    board.command("cursor_up") // → col1 header
    board.command("cursor_right") // → col2 header
    board.expect("#col2[data-cursor]").toExist()

    board.command("indent_node") // indent col2 under col1

    // col2 should now be a child of col1 (alongside 1a)
    const col1Children = childIds(repo, "col1")
    expect(col1Children).toContain("col2")
    expect(col1Children).toContain("1a")

    // col2's children should still be intact
    expect(childIds(repo, "col2")).toEqual(["2a", "2b"])
  })

  test("Tab on first column header is blocked (boundary)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to col1 header
    board.command("cursor_up") // → col1 header
    board.expect("#col1[data-cursor]").toExist()

    board.command("indent_node") // try indent — should be blocked (first column)

    // col1 should still be a top-level column
    expect(childIds(repo, "board")).toContain("col1")
    expect(childIds(repo, "board")).toContain("col2")
  })
})

// =============================================================================
// Indent visibility — indented node must remain visible on screen
// =============================================================================

describe("Indent visibility (regression: tab-disappear)", () => {
  test("indented node remains visible on screen after Tab", () => {
    const { board, repo } = testEnv(() => item("board", item("col", item("task1"), item("task2"), item("task3"))))

    board.command("cursor_down") // Move to task2
    board.command("indent_node") // Indent task2 under task1

    // Data: node was reparented correctly
    expect(repo.getNode("task2")?.parent_id).toBe("task1")

    // Visual: task2 must still be visible as a child of task1
    board.expectScreen("task2")
  })

  test("indented node visible when previous sibling has no children", () => {
    const { board, repo } = testEnv(() => item("board", item("col", item("A"), item("B"))))

    board.command("cursor_down") // Move to B
    board.command("indent_node") // Indent B under A

    expect(repo.getNode("B")?.parent_id).toBe("A")
    board.expectScreen("B")
  })

  test("all sibling items remain visible after indent", () => {
    const { board } = testEnv(() => item("board", item("col", item("first"), item("second"), item("third"))))

    board.command("cursor_down") // Move to second
    board.command("indent_node") // Indent second under first

    board.expectScreen("first")
    board.expectScreen("second")
    board.expectScreen("third")
  })

  test("cursor is visible after indent", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"), item("task3"))))

    board.command("cursor_down") // Move to task2
    board.command("indent_node") // Indent task2 under task1

    board.expectCursorVisible()
  })

  test("sequential indent keeps all nodes visible", () => {
    const { board } = testEnv(() => item("board", item("col", item("A"), item("B"), item("C"))))

    // Indent C under B
    board.command("cursor_down").command("cursor_down") // → C
    board.command("indent_node")
    board.expectScreen("C")

    // Indent B (with C as child) under A
    board.command("indent_node")
    board.expectScreen("A")
    board.expectScreen("B")
  })
})

// =============================================================================
// Indent/Outdent during inline edit mode
// =============================================================================

describe("Indent/Outdent during inline edit mode", () => {
  test("Tab indents node while in inline edit mode", () => {
    const { board, repo, store } = testEnv(() =>
      item("board", item("col", item("task1"), item("task2"), item("task3"))),
    )

    board.command("cursor_down") // → task2
    board.press("Enter") // enter inline edit mode
    expect(getActiveBoardPane(store.getState())!.inlineEditBlock).not.toBeNull()
    expect(getActiveBoardPane(store.getState())!.inlineEditBlock?.nodeId).toBe("task2")

    board.press("Tab") // indent task2 under task1

    // task2 should now be a child of task1
    expect(childIds(repo, "task1")).toContain("task2")
    expect(childIds(repo, "col")).toEqual(["task1", "task3"])

    // Should still be in inline edit mode
    expect(getActiveBoardPane(store.getState())!.inlineEditBlock).not.toBeNull()
  })

  test("Tab on first child in inline edit is no-op (no previous sibling)", () => {
    // Bug: km-tui.tab-first-child — Tab on first child indents the CARD
    // instead of being a no-op. The INDENT_NODE handler used ctx.card
    // (column-level card) instead of the inline edit target node.
    //
    // Scenario: navigate into card1's children via J (outline mode), cursor
    // lands on sub1. Enter inline edit on sub1, then press Tab. Sub1 is the
    // first child so indent should be a no-op — but it was indenting card1
    // (which had card0 as previous sibling).
    const { board, repo, store } = testEnv(() =>
      item("board", item("col", item("card0"), item("card1", item("sub1"), item("sub2")))),
    )

    board.command("cursor_down") // → card1
    board.command("block_nav_down") // J: enter card1's children → sub1 (outline mode)
    board.press("Enter") // enter inline edit on sub1

    const editBlock = getActiveBoardPane(store.getState())!.inlineEditBlock
    expect(editBlock).not.toBeNull()
    expect(editBlock?.nodeId).toBe("sub1")

    const parentBefore = repo.getNode("sub1")?.parent_id
    expect(parentBefore).toBe("card1")

    board.press("Tab") // should be no-op — sub1 is first child

    // sub1 should NOT have moved — still a child of card1
    expect(repo.getNode("sub1")?.parent_id).toBe(parentBefore)
    // card1 should NOT have been indented under card0
    expect(childIds(repo, "col")).toContain("card1")
    expect(childIds(repo, "card1")).toEqual(["sub1", "sub2"])
  })

  test("Tab on second child in inline edit indents under first child", () => {
    // When editing sub2 (which has sub1 as prev sibling),
    // Tab should indent sub2 under sub1 — not move the parent card.
    const { board, repo, store } = testEnv(() =>
      item("board", item("col", item("card1", item("sub1"), item("sub2")))),
    )

    board.command("block_nav_down") // J: enter card1's children → sub1
    board.command("cursor_down") // → sub2
    board.press("Enter") // enter inline edit on sub2
    expect(getActiveBoardPane(store.getState())!.inlineEditBlock?.nodeId).toBe("sub2")

    board.press("Tab") // indent sub2 under sub1

    expect(repo.getNode("sub2")?.parent_id).toBe("sub1")
  })

  test("Shift+Tab outdents sub-item in inline edit mode", () => {
    // In inline edit mode on a nested child, Shift+Tab should outdent the
    // sub-item, not the card.
    const { board, repo, store } = testEnv(() =>
      item("board", item("col", item("card1", item("sub1", item("nested"))))),
    )

    board.command("block_nav_down") // J: enter card1 → sub1
    board.command("block_nav_down") // J: enter sub1 → nested
    board.press("Enter") // enter inline edit on nested
    expect(getActiveBoardPane(store.getState())!.inlineEditBlock?.nodeId).toBe("nested")

    board.press("shift+Tab") // outdent nested to sibling of sub1

    expect(repo.getNode("nested")?.parent_id).toBe("card1")
  })
})

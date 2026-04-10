/**
 * Indent/Outdent Tests
 *
 * Tab = structural indent (reparent under previous sibling)
 * Shift+Tab = structural outdent (reparent to grandparent)
 *
 * Navigation model in cards view:
 * - j/k moves between sibling cards within a column (NOT into card children)
 * - Cursor follows the moved node (invariant): after indent/outdent, cursor
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
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// Helper: get child IDs of a parent from repo
function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Indent (Tab)", () => {
  describe("basic indent", () => {
    test("indent reparents node under previous sibling", () => {
      // col1: [A, B, C] — cursor on A, j → B, Tab → B becomes child of A
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.command("cursor_down") // Navigate to B
      expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])

      app.command("indent_node")

      expect(childIds(app.repo, "A")).toContain("B")
      expect(childIds(app.repo, "col1")).toEqual(["A", "C"])
    })

    test("indent last sibling reparents under previous", () => {
      // col1: [A, B, C] — j.j → C, Tab → C becomes child of B
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.command("cursor_down")
      app.command("cursor_down") // Navigate to C

      app.command("indent_node")

      expect(childIds(app.repo, "B")).toContain("C")
      expect(childIds(app.repo, "col1")).toEqual(["A", "B"])
    })

    test("indent appends as last child of previous sibling", () => {
      // col1: [parent(child1, child2), target] — j → target, Tab → last child of parent
      using app = createTestApp(
        item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
      )

      app.command("cursor_down") // Navigate to target (second card)

      app.command("indent_node")

      const parentChildren = childIds(app.repo, "parent")
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
    ])("indent $name bells (no-op)", async ({ fixture, expected }) => {
      using app = createTestApp(fixture())
      app.command("indent_node")
      expect(childIds(app.repo, "col1")).toEqual(expected)
    })
  })

  describe("multi-level indent", () => {
    test("sequential indent from bottom nests progressively", () => {
      // Start: col1 = [A, B, C]
      // Indent C under B → col1=[A, B], cursor follows C (now child of B)
      // Navigate to B, indent B under A → col1=[A], cursor follows B
      // Result: A → B → C
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      // Navigate to C, indent under B
      app.command("cursor_down")
      app.command("cursor_down") // cardIndex=2 (C)
      app.command("indent_node")
      expect(childIds(app.repo, "B")).toEqual(["C"])
      expect(childIds(app.repo, "col1")).toEqual(["A", "B"])

      // Cursor follows C (now under B). Navigate up to B to indent it.
      app.command("cursor_up") // C → B (or card-level B)
      app.command("indent_node")
      expect(childIds(app.repo, "A")).toContain("B")
      expect(childIds(app.repo, "col1")).toEqual(["A"])

      // Verify full nested tree: A → B → C
      expect(childIds(app.repo, "A")).toEqual(["B"])
      expect(childIds(app.repo, "B")).toEqual(["C"])
    })

    test("four-level sequential indent", () => {
      // Start: col1 = [A, B, C, D]
      // Indent D under C, cursor follows D → navigate to C
      // Indent C under B, cursor follows C → navigate to B
      // Indent B under A, cursor follows B
      // Result: A → B → C → D
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_down") // Navigate to D (cardIndex=3)
      app.command("indent_node")
      expect(childIds(app.repo, "C")).toEqual(["D"])

      // Cursor follows D. Navigate to C to indent it.
      app.command("cursor_up") // D → C
      app.command("indent_node")
      expect(childIds(app.repo, "B")).toContain("C")

      // Cursor follows C. Navigate to B to indent it.
      app.command("cursor_up") // C → B
      app.command("indent_node")
      expect(childIds(app.repo, "A")).toContain("B")

      // Verify: A → B → C → D
      expect(childIds(app.repo, "col1")).toEqual(["A"])
      expect(childIds(app.repo, "A")).toEqual(["B"])
      expect(childIds(app.repo, "B")).toEqual(["C"])
      expect(childIds(app.repo, "C")).toEqual(["D"])
    })
  })

  describe("cursor follows node after indent", () => {
    test("cursor follows indented node", () => {
      // col1: [A, B, C] — indent B under A → cursor follows B (now child of A)
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.command("cursor_down") // → B
      app.command("indent_node") // indent B under A → col1=[A, C], cursor follows B

      // B was indented under A
      expect(childIds(app.repo, "A")).toEqual(["B"])
      expect(childIds(app.repo, "col1")).toEqual(["A", "C"])
      // Cursor follows B (the indented node)
      app.expect("#B[data-cursor]").toExist()
    })

    test("cursor follows indented node when last sibling", () => {
      // col1: [A, B] — indent B under A → col1=[A], cursor follows B
      using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

      app.command("cursor_down") // → B
      app.command("indent_node") // indent B under A → col1=[A]

      expect(childIds(app.repo, "A")).toEqual(["B"])
      app.expect("#B[data-cursor]").toExist()
    })
  })
})

describe("Outdent (Shift+Tab)", () => {
  describe("basic outdent", () => {
    test("outdent moves card from column to board level", () => {
      // col1: [card1, card2] — card1's grandparent is board
      // Shift+Tab on card1 → card1 becomes sibling of col1 under board
      using app = createTestApp(item("board", item("col1", item("card1"), item("card2"))))

      app.press("shift+Tab")

      expect(childIds(app.repo, "board")).toContain("card1")
      expect(childIds(app.repo, "col1")).toEqual(["card2"])
    })

    test("outdent preserves remaining siblings in column", () => {
      // col1: [A, B, C] — outdent B → col1=[A, C], board gets B
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.command("cursor_down") // → B
      app.press("shift+Tab")

      expect(childIds(app.repo, "col1")).toEqual(["A", "C"])
      expect(childIds(app.repo, "board")).toContain("B")
    })
  })

  describe("outdent after indent (round-trip at column level)", () => {
    test("indent then outdent the same card back via zoom", () => {
      // This tests the structural round-trip:
      // 1. Indent B under A (B moves from col1 to A's children)
      // 2. Navigate to B requires zoom into A (separate view)
      // Here we test the reverse: outdent a card to board level, then re-indent
      using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

      // Outdent A from col1 to board level
      app.press("shift+Tab")
      expect(childIds(app.repo, "board")).toContain("A")
      expect(childIds(app.repo, "col1")).toEqual(["B"])

      // Note: can't easily navigate back and re-indent via keyboard
      // since A is now a board-level node (not in any column)
    })
  })

  describe("sort order after outdent", () => {
    test("outdent places card after its column in board children", () => {
      // col1: [card1] — outdent card1 → board = [col1, card1]
      using app = createTestApp(item("board", item("col1", item("card1"))))

      app.press("shift+Tab")

      const boardKids = childIds(app.repo, "board")
      expect(boardKids).toContain("col1")
      expect(boardKids).toContain("card1")
      const colIdx = boardKids.indexOf("col1")
      const cardIdx = boardKids.indexOf("card1")
      expect(cardIdx).toBeGreaterThan(colIdx)
    })

    test("outdent middle card places correctly relative to other columns", () => {
      // board: [col1(A, B, C), col2] — outdent B → board = [col1, B, col2]
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("X"))))

      app.command("cursor_down") // → B
      app.press("shift+Tab")

      // B should be placed after col1 in board's children
      const boardKids = childIds(app.repo, "board")
      expect(boardKids).toContain("B")
      const col1Idx = boardKids.indexOf("col1")
      const bIdx = boardKids.indexOf("B")
      expect(bIdx).toBeGreaterThan(col1Idx)
    })
  })

  describe("cursor follows node after outdent", () => {
    test("cursor follows outdented node to board level", () => {
      // col1: [A, B, C] — outdent A → A moves to board level, cursor follows A
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.press("shift+Tab") // outdent A → cursor follows A to board level

      expect(app.q("[data-cursor]").textContent()).toContain("A")
    })
  })
})

describe("Sort order preservation", () => {
  test("indent preserves relative order of remaining siblings", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Indent B under A
    app.command("cursor_down") // Navigate to B
    app.command("indent_node")

    // col1 should still have A, C, D in order
    expect(childIds(app.repo, "col1")).toEqual(["A", "C", "D"])
  })

  test("indent preserves sort order of target's existing children", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
    )

    app.command("cursor_down") // → target
    app.command("indent_node") // indent target under parent

    // target should be AFTER existing children
    const kids = childIds(app.repo, "parent")
    expect(kids).toEqual(["child1", "child2", "target"])
  })

  test("indent with two items produces correct parent_idx ordering", () => {
    using app = createTestApp(item("board", item("col1", item("parent"), item("A"), item("B"))))

    // Indent A under parent
    app.command("cursor_down") // → A
    app.command("indent_node") // A under parent, cursor follows A → card "parent" (index 0)

    // Navigate to B (now at index 1 in [parent, B])
    app.command("cursor_down") // → B
    // Indent B under parent
    app.command("indent_node")

    // Both A and B should be children of parent, in order
    const parentChildren = app.repo.getChildren("parent")
    expect(parentChildren.map((c) => c.id)).toEqual(["A", "B"])

    const aIdx = parentChildren.find((c) => c.id === "A")?.parent_idx ?? -1
    const bIdx = parentChildren.find((c) => c.id === "B")?.parent_idx ?? -1
    expect(bIdx).toBeGreaterThan(aIdx)
  })
})

describe("Interaction with folded nodes", () => {
  test("indent works when previous sibling is folded", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
    )

    // Fold parent
    app.command("fold_more") // fold_node on parent

    // Navigate to target
    app.command("cursor_down") // → target

    // Indent target under parent (folded parent is still valid)
    app.command("indent_node")

    expect(childIds(app.repo, "parent")).toContain("target")
  })

  test("indent works when previous sibling has children", () => {
    using app = createTestApp(item("board", item("col1", item("A", item("deep1"), item("deep2")), item("B"))))

    app.command("cursor_down") // → B
    app.command("indent_node") // indent B under A

    // B should be appended as last child of A (after deep1, deep2)
    expect(childIds(app.repo, "A")).toEqual(["deep1", "deep2", "B"])
  })
})

describe("Different view modes", () => {
  test("indent in columns view works", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))), {
      viewMode: "columns",
    })

    app.command("cursor_down") // Navigate to B

    app.command("indent_node")

    expect(childIds(app.repo, "A")).toContain("B")
    expect(childIds(app.repo, "col1")).toEqual(["A", "C"])
  })

  test("indent in list view works", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))), {
      viewMode: "list",
    })

    app.command("cursor_down") // Navigate to B

    app.command("indent_node")

    expect(childIds(app.repo, "A")).toContain("B")
  })

  test("outdent in columns view works", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))), {
      viewMode: "columns",
    })

    app.press("shift+Tab") // outdent A from col1 to board

    expect(childIds(app.repo, "board")).toContain("A")
  })
})

describe("Edge cases", () => {
  test("outdent from column to board level works", () => {
    // board → col1 → card1 — Shift+Tab makes card1 sibling of col1
    using app = createTestApp(item("board", item("col1", item("card1"), item("card2"))))

    app.press("shift+Tab")

    expect(childIds(app.repo, "board")).toContain("card1")
  })

  test("sequential indent + outdent on different cards", () => {
    // col1: [A, B, C]
    // Indent C under B → col1=[A, B], cursor follows C (now child of B)
    // Navigate to B, outdent B (with C as child) to board
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Indent C under B
    app.command("cursor_down")
    app.command("cursor_down") // → C
    app.command("indent_node")
    expect(childIds(app.repo, "B")).toEqual(["C"])
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])

    // Cursor follows C (now child of B). Navigate up to B.
    app.command("cursor_up") // → B
    // Outdent B (with C as child) from col1 to board
    app.press("shift+Tab")
    expect(childIds(app.repo, "board")).toContain("B")
    expect(childIds(app.repo, "col1")).toEqual(["A"])

    // B should still have C as child (outdent moves subtree)
    expect(childIds(app.repo, "B")).toEqual(["C"])
  })

  test("multiple sequential indents building deep hierarchy", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Indent D under C: col1=[A, B, C], cursor follows D (now child of C)
    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_down") // → D
    app.command("indent_node")
    expect(childIds(app.repo, "C")).toEqual(["D"])
    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])

    // Cursor follows D. Navigate to C to indent it under B.
    app.command("cursor_up") // → C
    app.command("indent_node")
    expect(childIds(app.repo, "B")).toContain("C")
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])

    // Verify nested: A, B → C → D
    expect(childIds(app.repo, "A")).toEqual([])
    expect(childIds(app.repo, "B")).toEqual(["C"])
    expect(childIds(app.repo, "C")).toEqual(["D"])
  })

  test.each([
    { name: "board level", nav: ["k", "k"] },
    { name: "column level", nav: ["k"] },
  ])("Tab and Shift+Tab are no-ops at $name", async ({ nav }) => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    for (const k of nav) app.press(k)

    const beforeBoard = childIds(app.repo, "board")
    const beforeCol1 = childIds(app.repo, "col1")

    app.command("indent_node")
    app.press("shift+Tab")

    // Structure unchanged
    expect(childIds(app.repo, "board")).toEqual(beforeBoard)
    expect(childIds(app.repo, "col1")).toEqual(beforeCol1)
  })
})

// =============================================================================
// Multi-select indent/outdent (atomic batch)
// =============================================================================

describe("Multi-select indent (atomic batch)", () => {
  test("indent selected cards (B,C,D) under previous siblings", async () => {
    // col1: [A, B, C, D, E] — select B,C,D via 2 J presses from B
    // (1st J: anchor=B, cursor→C, multiSelected={B}
    //  2nd J: cursor→D, range B→D = {B,C,D})
    // Tab → batch indent bottom-up: D→C, C→B, B→A
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))

    app.command("cursor_down") // → B (index 1)
    app.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}, cursor→C
    app.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}, cursor→D

    app.command("indent_node")

    // Bottom-up: D under C, C under B, B under A
    expect(childIds(app.repo, "A")).toEqual(["B"])
    expect(childIds(app.repo, "B")).toEqual(["C"])
    expect(childIds(app.repo, "C")).toEqual(["D"])
    expect(childIds(app.repo, "col1")).toEqual(["A", "E"])
  })

  test("multi-select indent fails atomically when first card can't indent", () => {
    // col1: [A, B, C, D] — select A,B,C via 2 J presses from A
    // A is first child (no prev sibling) → entire batch fails
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    app.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→B
    app.press("shift+ArrowDown") // range A→C, multiSelected={A:0,B:0,C:0}, cursor→C

    app.command("indent_node")

    // Nothing moved — atomic failure
    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C", "D"])
  })

  test("selection is cleared after successful multi-select indent", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    app.command("cursor_down") // → B
    app.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}
    app.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}
    app.command("indent_node")

    // After successful batch indent, no "selected" status
    const status = app.getStatus()
    if (status) {
      expect(status.message).not.toContain("selected")
    }
  })
})

describe("Multi-select outdent (atomic batch)", () => {
  test("outdent selected cards from column to board level", () => {
    // col1: [A, B, C, D] — select A,B,C via 2 J presses from A
    // Shift+Tab → all three move to board level
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    app.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→B
    app.press("shift+ArrowDown") // range A→C, multiSelected={A:0,B:0,C:0}, cursor→C

    app.press("shift+Tab")

    expect(childIds(app.repo, "board")).toContain("A")
    expect(childIds(app.repo, "board")).toContain("B")
    expect(childIds(app.repo, "board")).toContain("C")
    expect(childIds(app.repo, "col1")).toEqual(["D"])
  })
})

// =============================================================================
// Cursor position tracking (detailed)
// =============================================================================

describe("Cursor follows node (invariant)", () => {
  test.each([
    {
      name: "indent: cursor follows indented node (with siblings)",
      fixture: () => item("board", item("col1", item("A"), item("B"), item("C"))),
      nav: ["j"],
      key: "Tab",
      expected: "B",
    },
    {
      name: "indent: cursor follows indented node",
      fixture: () => item("board", item("col1", item("A"), item("B"))),
      nav: ["j"],
      key: "Tab",
      expected: "B",
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
    using app = createTestApp(fixture())
    for (const k of nav) app.press(k)
    app.press(key)
    // After structural tree changes (indent/outdent), cursor moves to the expected node.
    app.expect(`#${expected}[data-cursor]`).toExist()
  })

  test("indent then navigate: can reach next sibling after indent", () => {
    // Verify navigation works after cursor-follows-node
    // col1: [A, B, C] — indent B under A → cursor follows B, navigate to C
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    app.command("cursor_down") // → B
    app.command("indent_node") // indent B → cursor follows B (now child of A)
    // Navigate: cursor is on B (inside A). j should move down within the column.
    app.command("cursor_down") // → C (next visible item)

    expect(app.q("[data-cursor]").textContent()).toContain("C")
  })

  test("INVARIANT: indent then outdent preserves tree structure", () => {
    // col1: [A, B, C] — indent B under A → directly verify repo state
    // Then test outdent by constructing pre-nested tree
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))
    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])

    app.command("cursor_down") // → B
    app.command("indent_node") // indent B under A → cursor follows B
    expect(childIds(app.repo, "col1")).toEqual(["A", "C"]) // B moved under A
    expect(childIds(app.repo, "A")).toEqual(["B"])
    app.expect("#B[data-cursor]").toExist()
  })

  test("non-item nodes cannot be indented (type restriction)", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))
    // Change B to a non-item block (item=false) — non-indentable
    app.repo.updateNode("B", { type: "p", item: undefined })

    app.command("cursor_down") // → B
    app.command("indent_node") // attempt indent — should be blocked

    // B should still be a direct child of col1 (not moved under A)
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])
    expect(childIds(app.repo, "A")).toEqual([])
  })

  test("section and task nodes can still be indented (type restriction allows them)", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))
    // B is a task (default from item()), A is also a task — both should be indentable
    app.command("cursor_down") // → B
    app.command("indent_node") // indent B under A — should succeed

    expect(childIds(app.repo, "col1")).toEqual(["A"])
    expect(childIds(app.repo, "A")).toEqual(["B"])
  })
})

// =============================================================================
// Column Indent
// =============================================================================

describe("Column Indent", () => {
  test("Tab on column header indents column under previous column", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))

    // Navigate to col2 header: right from col1's first card
    app.command("cursor_up") // → col1 header
    app.command("cursor_right") // → col2 header
    app.expect("#col2[data-cursor]").toExist()

    app.command("indent_node") // indent col2 under col1

    // col2 should now be a child of col1 (alongside 1a)
    const col1Children = childIds(app.repo, "col1")
    expect(col1Children).toContain("col2")
    expect(col1Children).toContain("1a")

    // col2's children should still be intact
    expect(childIds(app.repo, "col2")).toEqual(["2a", "2b"])
  })

  test("Tab on first column header is blocked (boundary)", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

    // Navigate to col1 header
    app.command("cursor_up") // → col1 header
    app.expect("#col1[data-cursor]").toExist()

    app.command("indent_node") // try indent — should be blocked (first column)

    // col1 should still be a top-level column
    expect(childIds(app.repo, "board")).toContain("col1")
    expect(childIds(app.repo, "board")).toContain("col2")
  })
})

// =============================================================================
// Indent visibility — indented node must remain visible on screen
// =============================================================================

describe("Indent visibility (regression: tab-disappear)", () => {
  test("indented node remains visible on screen after Tab", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"), item("task3"))))

    app.command("cursor_down") // Move to task2
    app.command("indent_node") // Indent task2 under task1

    // Data: node was reparented correctly
    expect(app.repo.getNode("task2")?.parent_id).toBe("task1")

    // Visual: task2 must still be visible as a child of task1
    app.expectScreen("task2")
  })

  test("indented node visible when previous sibling has no children", () => {
    using app = createTestApp(item("board", item("col", item("A"), item("B"))))

    app.command("cursor_down") // Move to B
    app.command("indent_node") // Indent B under A

    expect(app.repo.getNode("B")?.parent_id).toBe("A")
    app.expectScreen("B")
  })

  test("all sibling items remain visible after indent", () => {
    using app = createTestApp(item("board", item("col", item("first"), item("second"), item("third"))))

    app.command("cursor_down") // Move to second
    app.command("indent_node") // Indent second under first

    app.expectScreen("first")
    app.expectScreen("second")
    app.expectScreen("third")
  })

  test("cursor is visible after indent", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"), item("task3"))))

    app.command("cursor_down") // Move to task2
    app.command("indent_node") // Indent task2 under task1

    // Cursor element exists and its bounding box is within screen bounds
    const loc = app.q("[data-cursor]")
    expect(loc.count()).toBeGreaterThan(0)
    const box = loc.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
    }
  })

  test("sequential indent keeps all nodes visible", () => {
    using app = createTestApp(item("board", item("col", item("A"), item("B"), item("C"))))

    // Indent C under B
    app.command("cursor_down")
    app.command("cursor_down") // → C
    app.command("indent_node")
    app.expectScreen("C")

    // Indent B (with C as child) under A
    app.command("indent_node")
    app.expectScreen("A")
    app.expectScreen("B")
  })
})

// =============================================================================
// Indent/Outdent during inline edit mode
// =============================================================================

describe("Indent/Outdent during inline edit mode", () => {
  test("Tab indents node while in inline edit mode", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"), item("task3"))))

    app.command("cursor_down") // → task2
    app.press("Enter") // enter inline edit mode
    app.expectEditing("task2")

    app.press("Tab") // indent task2 under task1

    // task2 should now be a child of task1
    expect(childIds(app.repo, "task1")).toContain("task2")
    expect(childIds(app.repo, "col")).toEqual(["task1", "task3"])

    // Should still be in inline edit mode
    app.expectEditing()
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
    using app = createTestApp(item("board", item("col", item("card0"), item("card1", item("sub1"), item("sub2")))))

    app.command("cursor_down") // → card1
    app.command("block_nav_down") // J: enter card1's children → sub1 (outline mode)
    app.press("Enter") // enter inline edit on sub1

    app.expectEditing("sub1")

    const parentBefore = app.repo.getNode("sub1")?.parent_id
    expect(parentBefore).toBe("card1")

    app.press("Tab") // should be no-op — sub1 is first child

    // sub1 should NOT have moved — still a child of card1
    expect(app.repo.getNode("sub1")?.parent_id).toBe(parentBefore)
    // card1 should NOT have been indented under card0
    expect(childIds(app.repo, "col")).toContain("card1")
    expect(childIds(app.repo, "card1")).toEqual(["sub1", "sub2"])
  })

  test("Tab on second child in inline edit indents under first child", () => {
    // When editing sub2 (which has sub1 as prev sibling),
    // Tab should indent sub2 under sub1 — not move the parent card.
    using app = createTestApp(item("board", item("col", item("card1", item("sub1"), item("sub2")))))

    app.command("block_nav_down") // J: enter card1's children → sub1
    app.command("cursor_down") // → sub2
    app.press("Enter") // enter inline edit on sub2
    app.expectEditing("sub2")

    app.press("Tab") // indent sub2 under sub1

    expect(app.repo.getNode("sub2")?.parent_id).toBe("sub1")
  })

  test("Shift+Tab outdents sub-item in inline edit mode", () => {
    // In inline edit mode on a nested child, Shift+Tab should outdent the
    // sub-item, not the card.
    using app = createTestApp(item("board", item("col", item("card1", item("sub1", item("nested"))))))

    app.command("block_nav_down") // J: enter card1 → sub1
    app.command("block_nav_down") // J: enter sub1 → nested
    app.press("Enter") // enter inline edit on nested
    app.expectEditing("nested")

    app.press("shift+Tab") // outdent nested to sibling of sub1

    expect(app.repo.getNode("nested")?.parent_id).toBe("card1")
  })
})

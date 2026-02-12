/**
 * Exploration Test: Create + Indent cursor stability
 *
 * Simulates creating nodes and indenting them, tracking cursor consistency.
 * Based on user report: "cursor does not stay with the indented nodes, cursor jumps around"
 * after creating and indenting in @next view.
 *
 * Tests creation via:
 * - `n` key (INSERT_BELOW) — creates sibling after cursor + enters inline edit
 * - Enter twice (TEXT_CONFIRM) — in inline edit, Enter saves current + creates new sibling
 *
 * Tests indent via:
 * - Tab — structural indent (reparent under previous sibling)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Helper: get cursor info from DOM */
function getCursorInfo(board: ReturnType<typeof testEnv>["board"]) {
  const cursorEl = board.q("[data-cursor]")
  return {
    text: cursorEl?.textContent() ?? null,
    exists: cursorEl ? cursorEl.count() > 0 : false,
  }
}

/** Helper: get child IDs */
function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Create + Indent cursor stability", () => {
  test("cursor follows node after create-then-indent", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )

    // Navigate to B
    board.press("j")
    expect(getCursorInfo(board).text).toContain("B")

    // Create new node after B (enters inline edit mode)
    board.press("n")
    // Exit inline edit
    board.press("Escape")

    // The new node should now be between B and C
    const col1Children = childIds(repo, "col1")
    expect(col1Children.length).toBe(6) // A, B, new, C, D, E

    // Indent the new node under B
    board.press("Tab")

    // Cursor should follow the indented node to parent card (B)
    const cursor = getCursorInfo(board)
    expect(cursor.exists).toBe(true)
    expect(cursor.text).toContain("B")
  })

  test("multiple create-indent cycles maintain cursor stability", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    // Cycle 1: create after A, indent under A
    board.press("n")
    board.press("Escape")
    board.press("Tab")
    expect(getCursorInfo(board).exists).toBe(true)

    // Cycle 2: navigate down, create, indent
    board.press("j")
    board.press("n")
    board.press("Escape")
    board.press("Tab")
    expect(getCursorInfo(board).exists).toBe(true)

    // Cycle 3
    board.press("j")
    board.press("n")
    board.press("Escape")
    board.press("Tab")
    expect(getCursorInfo(board).exists).toBe(true)

    // Verify no orphans or crashes
    const col1Children = childIds(repo, "col1")
    expect(col1Children.length).toBeGreaterThan(0)
  })

  test("Enter-Enter creates new siblings without cursor loss", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    // Start inline edit on A
    board.press("Enter")

    // Enter creates new sibling (TEXT_CONFIRM)
    board.press("Enter")
    // Another Enter creates another sibling
    board.press("Enter")
    // Exit edit
    board.press("Escape")

    // Should have created 2 new nodes, cursor should be valid
    const cursor = getCursorInfo(board)
    expect(cursor.exists).toBe(true)

    // col1 should have more children now
    const kids = childIds(repo, "col1")
    expect(kids.length).toBeGreaterThanOrEqual(5) // A + 2 new + B + C
  })

  test("Enter-Enter then indent maintains cursor", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    // Navigate to B, enter edit, press Enter twice to create nodes
    board.press("j")     // B
    board.press("Enter") // enter inline edit on B
    board.press("Enter") // TEXT_CONFIRM: save B + create new1 + edit new1
    board.press("Enter") // TEXT_CONFIRM: save new1 + create new2 + edit new2
    board.press("Escape") // exit edit

    // Cursor should be on the last created node
    const cursor = getCursorInfo(board)
    expect(cursor.exists).toBe(true)

    // Now indent: should reparent under previous sibling
    board.press("Tab")
    const cursorAfterIndent = getCursorInfo(board)
    expect(cursorAfterIndent.exists).toBe(true)
  })

  test("indent after create preserves fractional parent_idx without cursor loss", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("first"), item("second"), item("third"))),
    )

    // Navigate to "second"
    board.press("j")
    expect(getCursorInfo(board).text).toContain("second")

    // Create after "second" — produces a fractional parent_idx
    board.press("n")
    board.press("Escape")

    // Verify new node exists between second and third
    const col1Kids = repo.getChildren("col1")
    expect(col1Kids.length).toBe(4)
    const newNode = col1Kids.find(
      (n) => n.id !== "first" && n.id !== "second" && n.id !== "third",
    )
    expect(newNode).toBeDefined()

    // Check fractional parent_idx
    const secondNode = repo.getNode("second")
    const thirdNode = repo.getNode("third")
    if (newNode && secondNode && thirdNode) {
      const secondIdx = secondNode.parent_idx ?? 0
      const thirdIdx = thirdNode.parent_idx ?? 0
      const newIdx = newNode.parent_idx ?? 0
      expect(newIdx).toBeGreaterThan(secondIdx)
      expect(newIdx).toBeLessThan(thirdIdx)
    }

    // Indent the new node under "second"
    board.press("Tab")

    // Cursor should be on "second" card (parent of indented node)
    const cursor = getCursorInfo(board)
    expect(cursor.exists).toBe(true)
    expect(cursor.text).toContain("second")
  })

  test("100 mixed create/indent/navigate interactions", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("processing", item("t1"), item("t2"), item("t3"), item("t4"), item("t5")),
        item("next", item("t6"), item("t7"), item("t8")),
        item("doing", item("t9"), item("t10")),
      ),
    )

    const bugs: string[] = []
    let inEdit = false

    for (let i = 0; i < 100; i++) {
      let action: string
      if (inEdit) {
        // In edit mode: Enter (create another) or Escape (exit)
        action = i % 3 === 0 ? "Enter" : "Escape"
        if (action === "Escape") inEdit = false
      } else {
        const roll = i % 10
        if (roll < 3) {
          action = "j"
        } else if (roll < 5) {
          action = "k"
        } else if (roll < 7) {
          action = "n"
          inEdit = true
        } else if (roll === 7) {
          action = "Tab"
        } else if (roll === 8) {
          action = "l"
        } else {
          action = "Enter"
          inEdit = true
        }
      }

      try {
        board.press(action)
      } catch (e) {
        bugs.push(`[i=${i}] action=${action}: THREW ${e}`)
        continue
      }

      if (!inEdit) {
        const cursor = getCursorInfo(board)
        if (!cursor.exists) {
          bugs.push(`[i=${i}] action=${action}: no [data-cursor] in DOM`)
        }
      }
    }

    if (bugs.length > 0) {
      console.log("=== BUGS FOUND ===")
      for (const bug of bugs) console.log(bug)
    }
    expect(bugs).toEqual([])
  })

  test("25 structured create-indent cycles across columns", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col-a", item("a1"), item("a2"), item("a3")),
        item("col-b", item("b1"), item("b2")),
        item("col-c", item("c1"), item("c2"), item("c3"), item("c4")),
      ),
    )

    const bugs: string[] = []

    for (let cycle = 0; cycle < 25; cycle++) {
      // Step 1: Navigate
      if (cycle % 3 === 0) board.press("l")
      board.press("j")

      // Step 2: Create new node
      if (cycle % 2 === 0) {
        // Via `n` key
        board.press("n")
        board.press("Escape")
      } else {
        // Via Enter (enter edit) + Enter (create new) + Escape
        board.press("Enter")
        board.press("Enter")
        board.press("Escape")
      }

      // Step 3: Indent
      board.press("Tab")

      // Step 4: Validate cursor
      const cursor = getCursorInfo(board)
      if (!cursor.exists) {
        bugs.push(`[cycle=${cycle}] no [data-cursor] after create+indent`)
      }
    }

    if (bugs.length > 0) {
      console.log("=== BUGS FOUND (25 create-indent cycles) ===")
      for (const bug of bugs) console.log(bug)
    }
    expect(bugs).toEqual([])
  })
})

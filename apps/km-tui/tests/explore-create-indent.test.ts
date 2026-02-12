/**
 * Exploration Test: Create + Indent cursor stability
 *
 * Simulates creating nodes and indenting them, tracking cursor consistency.
 * Based on user report: "cursor does not stay with the indented nodes, cursor jumps around"
 * after creating and indenting in @next view.
 *
 * Runs 100 interactions mixing: navigate (j/k), create (n), exit edit (Escape), indent (Tab)
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/**
 * Helper: get cursor node info from board
 */
function getCursorInfo(board: ReturnType<typeof testEnv>["board"]) {
  const cursorEl = board.q("[data-cursor]")
  return {
    text: cursorEl?.textContent() ?? null,
    exists: !!cursorEl,
  }
}

/**
 * Helper: get child IDs of a parent from repo
 */
function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Create + Indent cursor stability", () => {
  test("cursor follows node after create-then-indent", () => {
    // Setup: board with a column containing several tasks
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )

    // Navigate to B
    board.press("j")
    expect(getCursorInfo(board).text).toContain("B")

    // Create new node after B (enters inline edit mode)
    board.press("n")

    // Exit inline edit (Escape saves + returns to node mode)
    board.press("Escape")

    // The new node should now be selected — it's between B and C
    const col1Children = childIds(repo, "col1")
    expect(col1Children.length).toBe(6) // A, B, new, C, D, E

    // The cursor should be on the new node (index 2, after B)
    // Now indent it under B
    board.press("Tab")

    // After indent, cursor should follow the indented node to its parent card (B)
    const cursor = getCursorInfo(board)
    expect(cursor.exists).toBe(true)
    // B is now the parent — cursor should be on B's card
    expect(cursor.text).toContain("B")
  })

  test("multiple create-indent cycles maintain cursor stability", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    // Cycle 1: navigate to A, create after, indent under A
    // Cursor starts on A
    board.press("n") // Create after A
    board.press("Escape") // Exit edit
    board.press("Tab") // Indent under A
    expect(getCursorInfo(board).exists).toBe(true)

    // Cycle 2: navigate down, create after, indent
    board.press("j") // Move to next card
    board.press("n") // Create after current
    board.press("Escape") // Exit edit
    board.press("Tab") // Indent under previous sibling
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

  test("create-indent does not produce 'cursor node not in repo' state", () => {
    // Larger fixture simulating @next-style board with multiple columns
    const { board } = testEnv(() =>
      item(
        "board",
        item("processing", item("task1"), item("task2"), item("task3"), item("task4"), item("task5")),
        item("next", item("task6"), item("task7"), item("task8")),
        item("doing", item("task9"), item("task10")),
      ),
    )

    const bugs: string[] = []

    // Run 100 mixed interactions, tracking edit mode programmatically
    let inEdit = false

    for (let i = 0; i < 100; i++) {
      // Choose action based on current state
      let action: string
      if (inEdit) {
        // If in edit mode, always escape first
        action = "Escape"
        inEdit = false
      } else {
        // Pick a weighted random action: more j/k (navigation), some n (create), some Tab (indent)
        const roll = i % 10
        if (roll < 4) action = "j"
        else if (roll < 6) action = "k"
        else if (roll < 8) {
          action = "n"
          inEdit = true
        } else if (roll === 8) action = "Tab"
        else action = "l" // change column
      }

      board.press(action)

      // Check cursor element exists in rendered output (unless in edit mode)
      if (!inEdit) {
        const cursorInfo = getCursorInfo(board)
        if (!cursorInfo.exists) {
          bugs.push(`[i=${i}] action=${action}: no [data-cursor] element in DOM after action`)
        }
      }
    }

    if (bugs.length > 0) {
      console.log("=== BUGS FOUND ===")
      for (const bug of bugs) {
        console.log(bug)
      }
    }
    expect(bugs).toEqual([])
  })

  test("indent after create preserves fractional parent_idx without cursor loss", () => {
    // This specifically tests the scenario where:
    // 1. Create node (gets fractional parent_idx via midpoint)
    // 2. Indent it (reparent under previous sibling)
    // 3. Cursor should stay on the node (now nested)
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("first"), item("second"), item("third"))),
    )

    // Navigate to "second"
    board.press("j")
    expect(getCursorInfo(board).text).toContain("second")

    // Create after "second" — this produces a fractional parent_idx
    board.press("n")
    board.press("Escape")

    // Verify fractional parent_idx was created
    const col1Kids = repo.getChildren("col1")
    const newNode = col1Kids.find((n) => n.id !== "first" && n.id !== "second" && n.id !== "third")
    expect(newNode).toBeDefined()

    // The new node should have a fractional parent_idx (midpoint between second and third)
    const secondNode = repo.getNode("second")
    const thirdNode = repo.getNode("third")
    if (newNode && secondNode && thirdNode) {
      const secondIdx = secondNode.parent_idx ?? 0
      const thirdIdx = thirdNode.parent_idx ?? 0
      const newIdx = newNode.parent_idx ?? 0
      expect(newIdx).toBeGreaterThan(secondIdx)
      expect(newIdx).toBeLessThan(thirdIdx)
    }

    // Now indent the new node under "second"
    board.press("Tab")

    // Cursor should still exist and be on "second" card (parent of the indented node)
    const cursor = getCursorInfo(board)
    expect(cursor.exists).toBe(true)
    expect(cursor.text).toContain("second")
  })

  test("100 create-indent cycles on multi-column board", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col-a", item("a1"), item("a2"), item("a3")),
        item("col-b", item("b1"), item("b2")),
        item("col-c", item("c1"), item("c2"), item("c3"), item("c4")),
      ),
    )

    const bugs: string[] = []

    // Structured 100 interactions: cycles of [navigate, create, escape, indent]
    for (let cycle = 0; cycle < 25; cycle++) {
      // Step 1: Navigate somewhere (j or l)
      if (cycle % 3 === 0) {
        board.press("l") // Move to next column
      }
      board.press("j") // Move down

      // Step 2: Create new node
      board.press("n")

      // Step 3: Exit edit
      board.press("Escape")

      // Step 4: Indent
      board.press("Tab")

      // Validate cursor exists in DOM after full create+indent cycle
      const cursor = getCursorInfo(board)
      if (!cursor.exists) {
        bugs.push(`[cycle=${cycle}] no [data-cursor] in DOM after create+indent`)
      }
    }

    if (bugs.length > 0) {
      console.log("=== BUGS FOUND (100 create-indent cycles) ===")
      for (const bug of bugs) {
        console.log(bug)
      }
    }
    expect(bugs).toEqual([])
  })
})

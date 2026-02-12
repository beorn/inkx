/**
 * Exploration: Folding and deletion operations
 *
 * Tests cursor stability across:
 * - Folding/unfolding with z
 * - Deletion with d/dd
 * - Fold then navigate
 * - Delete then navigate
 * - Mixed fold/unfold/delete/create
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function cursorCheck(board: ReturnType<typeof testEnv>["board"]) {
  const el = board.q("[data-cursor]")
  return {
    exists: el ? el.count() > 0 : false,
    text: el?.textContent() ?? "(none)",
  }
}

describe("Exploration: fold and delete", () => {
  function foldBoard() {
    return testEnv(() =>
      item(
        "board",
        item(
          "projects",
          item("proj-a", item("task-1"), item("task-2"), item("task-3")),
          item("proj-b", item("task-4"), item("task-5")),
          item("proj-c", item("task-6")),
        ),
        item("areas", item("health"), item("finance"), item("learning")),
        item("inbox", item("note-1"), item("note-2"), item("note-3"), item("note-4")),
      ),
    )
  }

  test("fold and unfold with z key", () => {
    const { board } = foldBoard()
    const bugs: string[] = []

    // Navigate to proj-a (has children)
    board.press("j") // proj-a

    // Fold
    board.press("z")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after fold: no cursor")

    // Navigate while folded
    board.press("j")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after j while folded: no cursor")

    board.press("k")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after k while folded: no cursor")

    // Unfold
    board.press("z")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after unfold: no cursor")

    // Navigate after unfold
    for (let i = 0; i < 5; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav after unfold ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("fold all then navigate between columns", () => {
    const { board } = foldBoard()
    const bugs: string[] = []

    // Fold proj-a
    board.press("j")
    board.press("z")

    // Navigate to proj-b and fold
    board.press("j")
    board.press("z")

    // Navigate to proj-c and fold
    board.press("j")
    board.press("z")

    // Navigate to next column
    board.press("l")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after l to areas with folds: no cursor")

    // Navigate back
    board.press("h")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after h back to projects with folds: no cursor")

    expect(bugs).toEqual([])
  })

  test("delete current card with d", () => {
    const { board } = foldBoard()
    const bugs: string[] = []

    // Navigate to first card
    board.press("j") // proj-a

    // Delete it
    board.press("d")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after d: no cursor")

    // Navigate to verify
    for (let i = 0; i < 3; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav after delete ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("delete multiple cards in sequence", () => {
    const { board } = foldBoard()
    const bugs: string[] = []

    // Delete first 3 cards in projects
    for (let i = 0; i < 3; i++) {
      board.press("j")
      board.press("d")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[delete ${i}] no cursor`)
    }

    // Navigate across columns
    board.press("l")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after l post-deletes: no cursor")

    board.press("h")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after h post-deletes: no cursor")

    expect(bugs).toEqual([])
  })

  test("fold, then create new sibling", () => {
    const { board } = foldBoard()
    const bugs: string[] = []

    // Navigate and fold
    board.press("j")
    board.press("z")

    // Create new sibling after folded item
    board.press("n")
    board.press("Escape")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after create near fold: no cursor")

    // Navigate
    for (let i = 0; i < 5; i++) {
      board.press(i % 2 === 0 ? "j" : "k")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav ${i}] no cursor after fold+create`)
    }

    expect(bugs).toEqual([])
  })

  test("delete then create in same position", () => {
    const { board } = foldBoard()
    const bugs: string[] = []

    for (let cycle = 0; cycle < 10; cycle++) {
      // Navigate to a card
      board.press("j")

      // Delete it
      board.press("d")
      let c = cursorCheck(board)
      if (!c.exists) bugs.push(`[cycle ${cycle}] no cursor after delete`)

      // Create replacement
      board.press("n")
      board.press("Escape")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[cycle ${cycle}] no cursor after create`)
    }

    expect(bugs).toEqual([])
  })

  test("200 mixed fold/delete/create/navigate", { timeout: 15000 }, () => {
    const { board } = foldBoard()
    const bugs: string[] = []
    let inEdit = false

    let seed = 31
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "z", "d", "n", "Tab", "Shift+Tab"]
    const editOps = ["Escape", "Enter"]

    for (let i = 0; i < 200; i++) {
      let op: string
      if (inEdit) {
        op = editOps[Math.floor(rand() * editOps.length)]!
        if (op === "Escape") inEdit = false
      } else {
        op = normalOps[Math.floor(rand() * normalOps.length)]!
        if (op === "n") inEdit = true
      }

      try {
        board.press(op)
      } catch (e) {
        bugs.push(`[${i}] ${op}: THREW ${e}`)
        inEdit = false
        continue
      }

      if (!inEdit) {
        const c = cursorCheck(board)
        if (!c.exists) {
          bugs.push(`[${i}] ${op}: no cursor`)
        }
      }
    }

    if (bugs.length > 0) {
      console.log("=== BUGS (200 fold/delete ops) ===")
      for (const b of bugs) console.log(b)
    }
    expect(bugs).toEqual([])
  })
})

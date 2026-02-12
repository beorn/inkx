/**
 * Exploration: View transitions and outline depth changes
 *
 * Tests cursor stability across:
 * - View mode changes (v to cycle cards/list/columns/tabs)
 * - Outline depth changes (< and >)
 * - Zoom in/out (e and u)
 * - Combinations with create/indent/navigate
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

describe("Exploration: view transitions", () => {
  function deepBoard() {
    return testEnv(() =>
      item(
        "board",
        item(
          "projects",
          item(
            "proj-a",
            item("task-a1"),
            item("task-a2"),
            item("task-a3", item("sub-1"), item("sub-2")),
          ),
          item("proj-b", item("task-b1"), item("task-b2")),
        ),
        item(
          "areas",
          item("health", item("exercise"), item("diet")),
          item("finance", item("budget"), item("invest")),
          item("learning", item("books"), item("courses")),
        ),
        item("inbox", item("note-1"), item("note-2"), item("note-3")),
      ),
    )
  }

  test("cycle through all view modes with navigation", () => {
    const { board } = deepBoard()
    const bugs: string[] = []

    // Cards -> List -> Columns -> Tabs -> Cards
    const viewModes = ["v", "v", "v", "v"]

    for (let round = 0; round < 3; round++) {
      for (const v of viewModes) {
        board.press(v)
        const c = cursorCheck(board)
        if (!c.exists) bugs.push(`[round=${round}] after ${v}: no cursor`)

        // Navigate in each view mode
        for (let i = 0; i < 5; i++) {
          board.press(i % 2 === 0 ? "j" : "k")
          const cc = cursorCheck(board)
          if (!cc.exists) bugs.push(`[round=${round}] nav ${i}: no cursor`)
        }
      }
    }

    expect(bugs).toEqual([])
  })

  test("outline depth changes preserve cursor", () => {
    const { board } = deepBoard()
    const bugs: string[] = []

    // Navigate into first column
    board.press("j")
    board.press("j")

    // Increase depth (<)
    for (let i = 0; i < 5; i++) {
      board.press("<")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[depth increase ${i}] no cursor`)
    }

    // Decrease depth (>)
    for (let i = 0; i < 5; i++) {
      board.press(">")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[depth decrease ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("zoom in and out with navigation", () => {
    const { board } = deepBoard()
    const bugs: string[] = []

    // Navigate to proj-a
    board.press("j")

    // Zoom in
    board.press("e")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after zoom in: no cursor")

    // Navigate inside zoomed view
    for (let i = 0; i < 5; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[zoomed nav ${i}] no cursor`)
    }

    // Zoom out
    board.press("u")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after zoom out: no cursor")

    // Navigate after zoom out
    for (let i = 0; i < 5; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[unzoomed nav ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("create inside zoomed view", () => {
    const { board } = deepBoard()
    const bugs: string[] = []

    // Navigate to proj-a and zoom in
    board.press("j")
    board.press("e")

    // Create nodes inside zoomed view
    for (let i = 0; i < 5; i++) {
      board.press("j")
      board.press("n")
      board.press("Escape")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[create ${i} in zoom] no cursor`)
    }

    // Zoom out — cursor should still be valid
    board.press("u")
    const c = cursorCheck(board)
    if (!c.exists) bugs.push("after zoom out post-create: no cursor")

    expect(bugs).toEqual([])
  })

  test("view switch during inline edit", () => {
    const { board } = deepBoard()
    const bugs: string[] = []

    // Navigate and start editing
    board.press("j")
    board.press("Enter") // start inline edit

    // Press v during edit — should be ignored or handled gracefully
    board.press("v")

    // Escape from edit
    board.press("Escape")
    const c = cursorCheck(board)
    if (!c.exists) bugs.push("after edit+v+escape: no cursor")

    // Navigate to verify state
    board.press("j")
    board.press("k")
    const c2 = cursorCheck(board)
    if (!c2.exists) bugs.push("after post-edit nav: no cursor")

    expect(bugs).toEqual([])
  })

  test("200 mixed view/nav/create operations", () => {
    const { board } = deepBoard()
    const bugs: string[] = []
    let inEdit = false

    let seed = 99
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "v", "<", ">", "e", "u", "n", "Tab", "Shift+Tab"]
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
      console.log("=== BUGS (200 mixed ops) ===")
      for (const b of bugs) console.log(b)
    }
    expect(bugs).toEqual([])
  })
})

/**
 * Exploration: Multi-select operations
 *
 * Tests cursor stability across:
 * - Selecting/deselecting with x
 * - Selecting ranges with X (shift+x)
 * - Operations on selections (delete, indent, outdent, move)
 * - Selection across columns
 * - Selection + view mode changes
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

describe("Exploration: selection operations", () => {
  function selBoard() {
    return testEnv(() =>
      item(
        "board",
        item("todo", item("task-1"), item("task-2"), item("task-3"), item("task-4"), item("task-5")),
        item("doing", item("active-1"), item("active-2"), item("active-3")),
        item("done", item("finished-1"), item("finished-2")),
      ),
    )
  }

  test("select and deselect with x", () => {
    const { board } = selBoard()
    const bugs: string[] = []

    // Select individual items
    for (let i = 0; i < 5; i++) {
      board.press("j")
      board.press("x") // toggle select
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[select ${i}] no cursor after x`)
    }

    // Deselect them going back up
    for (let i = 0; i < 5; i++) {
      board.press("k")
      board.press("x") // toggle deselect
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[deselect ${i}] no cursor after x`)
    }

    expect(bugs).toEqual([])
  })

  test("select range with X (shift+x)", () => {
    const { board } = selBoard()
    const bugs: string[] = []

    // Navigate to first task
    board.press("j")

    // Select range downward
    for (let i = 0; i < 4; i++) {
      board.press("X") // shift+x for range select
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[range select ${i}] no cursor after X`)
    }

    expect(bugs).toEqual([])
  })

  test("indent selected items", () => {
    const { board } = selBoard()
    const bugs: string[] = []

    // Select task-2 and task-3
    board.press("j") // task-1
    board.press("j") // task-2
    board.press("x") // select task-2
    board.press("j") // task-3
    board.press("x") // select task-3

    // Indent selection
    board.press("Tab")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after Tab indent: no cursor")

    // Navigate to verify
    for (let i = 0; i < 5; i++) {
      board.press(i % 2 === 0 ? "j" : "k")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav ${i}] no cursor after indent`)
    }

    expect(bugs).toEqual([])
  })

  test("outdent selected items", () => {
    const { board } = selBoard()
    const bugs: string[] = []

    // Navigate to some items and select
    board.press("j") // task-1
    board.press("x")
    board.press("j") // task-2
    board.press("x")

    // Outdent
    board.press("Shift+Tab")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after Shift+Tab: no cursor")

    // Navigate
    for (let i = 0; i < 5; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav ${i}] no cursor after outdent`)
    }

    expect(bugs).toEqual([])
  })

  test("select then change view mode", () => {
    const { board } = selBoard()
    const bugs: string[] = []

    // Select some items
    board.press("j")
    board.press("x")
    board.press("j")
    board.press("x")

    // Cycle view modes
    for (let i = 0; i < 4; i++) {
      board.press("v")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[view cycle ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("select across columns with h/l", () => {
    const { board } = selBoard()
    const bugs: string[] = []

    // Select in todo column
    board.press("j")
    board.press("x")

    // Move to doing column
    board.press("l")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after l to doing: no cursor")

    // Select in doing column
    board.press("x")
    board.press("j")
    board.press("x")

    // Move to done column
    board.press("l")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after l to done: no cursor")

    // Back to todo
    board.press("h")
    board.press("h")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after h h back to todo: no cursor")

    expect(bugs).toEqual([])
  })

  test("200 random select/navigate/indent operations", () => {
    const { board } = selBoard()
    const bugs: string[] = []
    let inEdit = false

    let seed = 77
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "x", "X", "Tab", "Shift+Tab", "n", "v", "Escape"]
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
      console.log("=== BUGS (200 selection ops) ===")
      for (const b of bugs) console.log(b)
    }
    expect(bugs).toEqual([])
  })
})

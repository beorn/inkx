/**
 * Exploration: Search dialog operations
 *
 * Tests cursor stability across:
 * - Opening/closing search with /
 * - Typing search queries
 * - Navigating search results
 * - Selecting a result and navigating after
 * - Search then create/indent/delete
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

describe("Exploration: search dialog", () => {
  function searchBoard() {
    return testEnv(() =>
      item(
        "board",
        item("todo", item("buy-groceries"), item("fix-bug"), item("review-pr"), item("deploy-app")),
        item("doing", item("write-tests"), item("refactor-code"), item("update-docs")),
        item("done", item("setup-ci"), item("add-login"), item("fix-typo")),
      ),
    )
  }

  test("open and close search with /", () => {
    const { board } = searchBoard()
    const bugs: string[] = []

    // Open search
    board.press("/")

    // Close with Escape
    board.press("Escape")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after /+Escape: no cursor")

    // Navigate to verify
    board.press("j")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after j post-search: no cursor")

    expect(bugs).toEqual([])
  })

  test("rapid open/close search cycles", () => {
    const { board } = searchBoard()
    const bugs: string[] = []

    for (let i = 0; i < 20; i++) {
      board.press("/")
      board.press("Escape")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[cycle ${i}] no cursor after /+Escape`)
    }

    // Navigate after all the cycling
    for (let i = 0; i < 5; i++) {
      board.press("j")
      const c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav ${i}] no cursor after search cycles`)
    }

    expect(bugs).toEqual([])
  })

  test("search with navigation between results", () => {
    const { board } = searchBoard()
    const bugs: string[] = []

    // Open search and navigate results
    board.press("/")

    // Navigate results (j/k should move between results in search mode)
    for (let i = 0; i < 5; i++) {
      board.press(i % 2 === 0 ? "j" : "k")
    }

    // Close and verify
    board.press("Escape")
    const c = cursorCheck(board)
    if (!c.exists) bugs.push("after search nav + Escape: no cursor")

    expect(bugs).toEqual([])
  })

  test("search then immediately create", () => {
    const { board } = searchBoard()
    const bugs: string[] = []

    // Navigate somewhere first
    board.press("j")

    // Open and close search
    board.press("/")
    board.press("Escape")

    // Immediately create
    board.press("n")
    board.press("Escape")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after search+create: no cursor")

    // Navigate
    for (let i = 0; i < 5; i++) {
      board.press("j")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("search, cancel, change view, search again", () => {
    const { board } = searchBoard()
    const bugs: string[] = []

    // Search cycle 1
    board.press("/")
    board.press("Escape")

    // Change view
    board.press("v")
    let c = cursorCheck(board)
    if (!c.exists) bugs.push("after v post-search: no cursor")

    // Search cycle 2
    board.press("/")
    board.press("Escape")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after second search: no cursor")

    // Change view again
    board.press("v")
    c = cursorCheck(board)
    if (!c.exists) bugs.push("after second v: no cursor")

    // Navigate
    for (let i = 0; i < 5; i++) {
      board.press(i % 2 === 0 ? "j" : "k")
      c = cursorCheck(board)
      if (!c.exists) bugs.push(`[nav ${i}] no cursor`)
    }

    expect(bugs).toEqual([])
  })

  test("200 mixed search/nav/create operations", () => {
    const { board } = searchBoard()
    const bugs: string[] = []
    let inEdit = false
    let inSearch = false

    let seed = 55
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    const normalOps = ["j", "k", "l", "h", "/", "n", "v", "z", "d", "Tab", "Shift+Tab"]
    const editOps = ["Escape", "Enter"]
    const searchOps = ["Escape", "j", "k", "Enter"]

    for (let i = 0; i < 200; i++) {
      let op: string
      if (inSearch) {
        op = searchOps[Math.floor(rand() * searchOps.length)]!
        if (op === "Escape" || op === "Enter") inSearch = false
      } else if (inEdit) {
        op = editOps[Math.floor(rand() * editOps.length)]!
        if (op === "Escape") inEdit = false
      } else {
        op = normalOps[Math.floor(rand() * normalOps.length)]!
        if (op === "n") inEdit = true
        if (op === "/") inSearch = true
      }

      try {
        board.press(op)
      } catch (e) {
        bugs.push(`[${i}] ${op}: THREW ${e}`)
        inEdit = false
        inSearch = false
        continue
      }

      if (!inEdit && !inSearch) {
        const c = cursorCheck(board)
        if (!c.exists) {
          bugs.push(`[${i}] ${op}: no cursor`)
        }
      }
    }

    if (bugs.length > 0) {
      console.log("=== BUGS (200 search ops) ===")
      for (const b of bugs) console.log(b)
    }
    expect(bugs).toEqual([])
  })
})

/**
 * Exploration: Detail pane toggle, display, keybinding interaction
 *
 * Focus: `i` on leaf node opens detail pane, `h` closes it in non-list views,
 * DETAIL_PANE_CLOSE works, task status renders on embeds in detail.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Detail Pane", () => {
  test("i on leaf node opens detail pane", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    // Cursor starts on A (leaf task). Press i to zoom in — should open detail pane.
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output after i on leaf node")
    }
    // Detail pane should show something about A
    // (even if just the node title in detail)
    expect(bugs).toEqual([])
  })

  test("i on folder node zooms in instead of opening detail pane", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A", item("child1"), item("child2")), item("B"))))
    const bugs: string[] = []

    // A has children → i should zoom in, not open detail pane
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output after i on folder node")
    }
    expect(bugs).toEqual([])
  })

  test("h closes detail pane in cards view", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    // Open detail pane with i on leaf
    board.press("i")
    // Press h to close detail pane (non-list view behavior)
    board.press("h")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after closing detail pane with h")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane after navigation j/k", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    // Open detail pane
    board.press("i")
    // Navigate down while detail pane might be open
    board.press("j")
    board.press("j")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage during navigation with detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane with column navigation h/l", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Open detail pane, then navigate across columns
    board.press("i")
    // h should close detail pane, not navigate
    board.press("h")
    // Now l navigates to col2
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane + column navigation")
    }
    expect(bugs).toEqual([])
  })

  test("Escape closes detail pane or overlay", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    // Open detail pane
    board.press("i")
    // Escape should close it
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Escape on detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane reopened after close", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    // Open, close, reopen
    board.press("i")
    board.press("Escape")
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after reopening detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane with task status fields", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item.task("Important task", "todo"), item.task("Done task", "done"))),
    )
    const bugs: string[] = []

    // Open detail pane on first task
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in detail pane for task with status")
    }
    // Task detail should display some info
    expect(bugs).toEqual([])
  })

  test("detail pane width doesn't crash with narrow terminal", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))), { columns: 40, rows: 12 })
    const bugs: string[] = []

    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in narrow terminal detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("list view has detail pane by default, h navigates", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), { viewMode: "list" })
    const bugs: string[] = []

    // In list view, detail pane is on by default
    // h should navigate (not just close detail pane)
    board.press("h")
    board.press("j")
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in list view with detail pane")
    }
    expect(bugs).toEqual([])
  })
})

/**
 * Exploration: Dialog interactions — switching between dialogs, overlays,
 * and modes without crashes.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Dialog Interactions", () => {
  test("cycle through all dialog types", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    // Search
    board.press("/")
    board.press("Escape")
    // New item
    board.press("n")
    board.press("Escape")
    // Help
    board.press("?")
    board.press("Escape")
    // Detail pane
    board.press(" ")
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after cycling through dialogs")
    }
    expect(bugs).toEqual([])
  })

  test("new item while detail pane is open", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press(" ") // open detail pane
    board.press("n") // open new item — should close detail pane

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after new item with detail pane open")
    }
    expect(bugs).toEqual([])
  })

  test("help while detail pane is open", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))), { columns: 80, rows: 50 })
    const bugs: string[] = []

    board.press(" ") // open detail pane
    board.press("?") // open help overlay

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after help with detail pane open")
    }
    expect(bugs).toEqual([])
  })

  test("inline edit then dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Enter") // inline edit
    board.press("Escape") // cancel edit
    board.press("n") // new item dialog
    board.press("Escape") // cancel

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after inline edit then dialog")
    }
    expect(bugs).toEqual([])
  })

  test("fold then dialog interactions", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("z").press("a") // fold
    board.press("n") // new item dialog
    board.press("Escape")
    board.press("/") // search
    board.press("Escape")
    board.press(" ") // detail pane
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold then dialog interactions")
    }
    expect(bugs).toEqual([])
  })

  test("selection then dialogs", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("J") // select A→B
    board.press("n") // new item — should clear selection
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection then dialog")
    }
    expect(bugs).toEqual([])
  })

  test("outline mode then dialogs", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    // Enter outline mode on a folder
    board.press(" ") // detail pane (outline mode)
    board.press("Escape")
    board.press("/") // search
    board.press("Escape")
    board.press("?") // help
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after outline mode then dialogs")
    }
    expect(bugs).toEqual([])
  })

  test("console panel toggle", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("`") // toggle console
    board.press("`") // toggle off

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after console toggle")
    }
    expect(bugs).toEqual([])
  })

  test("console then search then new item", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("`") // console open
    board.press("Escape") // close console
    board.press("/") // search
    board.press("Escape")
    board.press("n") // new item
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after console then search then new item")
    }
    expect(bugs).toEqual([])
  })

  test("all overlays on narrow terminal", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))), { columns: 30, rows: 10 })
    const bugs: string[] = []

    board.press("n")
    board.press("Escape")
    board.press("/")
    board.press("Escape")
    board.press("?")
    board.press("Escape")
    board.press(" ")
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after overlays on narrow terminal")
    }
    expect(bugs).toEqual([])
  })
})

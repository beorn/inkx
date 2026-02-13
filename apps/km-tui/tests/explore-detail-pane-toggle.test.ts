/**
 * Exploration: Detail pane — Space opens, h closes (non-list), Escape closes,
 * navigation with detail pane open, task status display on embeds.
 *
 * Focus: Space key toggle (new binding), Ctrl+I if mapped, interaction sequences.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Detail Pane Toggle", () => {
  test("Space opens detail pane on leaf node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press(" ") // Space opens detail pane

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Space on leaf")
    }
    expect(bugs).toEqual([])
  })

  test("h closes detail pane in cards view", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    board.press(" ") // open detail pane
    board.press("h") // close in cards view

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after h to close detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("Escape closes detail pane", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press(" ") // open
    board.press("Escape") // close

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Escape closing detail")
    }
    expect(bugs).toEqual([])
  })

  test("Space toggle: open, close, open cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press(" ") // open
    board.press("Escape") // close
    board.press(" ") // reopen

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after toggle cycle")
    }
    expect(bugs).toEqual([])
  })

  test("j/k navigation with detail pane open updates content", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press(" ") // open detail pane on A

    board.press("j") // move to B (detail should update)
    const text1 = board.screenshot()
    if (text1.includes("[object Object]") || text1.includes("TypeError")) {
      bugs.push("garbage after j with detail open")
    }

    board.press("j") // move to C
    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage after second j with detail open")
    }

    board.press("k") // back to B
    const text3 = board.screenshot()
    if (text3.includes("[object Object]") || text3.includes("TypeError")) {
      bugs.push("garbage after k with detail open")
    }

    expect(bugs).toEqual([])
  })

  test("detail pane on task with status", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item.task("Buy groceries", "todo"),
          item.task("Fix bug", "wip"),
          item.task("Deploy", "done"),
        ),
      ),
    )
    const bugs: string[] = []

    // Open detail on each task
    board.press(" ")
    const text1 = board.screenshot()
    if (text1.includes("[object Object]") || text1.includes("TypeError")) {
      bugs.push("garbage on todo task detail")
    }

    board.press("j")
    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage on wip task detail")
    }

    board.press("j")
    const text3 = board.screenshot()
    if (text3.includes("[object Object]") || text3.includes("TypeError")) {
      bugs.push("garbage on done task detail")
    }

    expect(bugs).toEqual([])
  })

  test("detail pane with column navigation l", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press(" ") // open detail
    // h should close detail pane first, then l to navigate
    board.press("h")
    board.press("l") // navigate to col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane + column nav")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane in list view: Space opens, h navigates", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"), item("B"), item("C"))),
      { viewMode: "list" },
    )
    const bugs: string[] = []

    board.press(" ") // Space in list view
    board.press("h") // h in list view should navigate, not just close

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in list view detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane in narrow terminal", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"), item("B"))),
      { columns: 40, rows: 12 },
    )
    const bugs: string[] = []

    board.press(" ")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in narrow terminal detail")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane on folder opens detail (not zoom)", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("folder-with-children", item("child1"), item("child2")),
          item("leaf"),
        ),
      ),
    )
    const bugs: string[] = []

    // Space on a folder should open detail pane with outline
    board.press(" ")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage on folder detail pane")
    }
    expect(bugs).toEqual([])
  })
})

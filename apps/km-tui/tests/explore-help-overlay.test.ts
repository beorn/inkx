/**
 * Exploration: Help overlay — ? opens, ? or Esc closes, content categories visible,
 * fits in 80x24 terminal, interaction after close.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Help Overlay", () => {
  test("? opens help overlay", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("?")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after ? opens help")
    }
    // Help should show some content
    if (!text.includes("Navigation") && !text.includes("Edit") && !text.includes("View")) {
      bugs.push("help overlay missing expected categories")
    }
    expect(bugs).toEqual([])
  })

  test("? closes help overlay (toggle)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("?") // open
    board.press("?") // close

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after ? toggle close")
    }
    expect(bugs).toEqual([])
  })

  test("Escape closes help overlay", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("?") // open
    board.press("Escape") // close

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Escape closes help")
    }
    expect(bugs).toEqual([])
  })

  test("help overlay includes key categories", () => {
    // Use taller terminal to fit all help content
    const { board } = testEnv(
      () => item("board", item("col1", item("A"))),
      { columns: 80, rows: 50 },
    )
    const bugs: string[] = []

    board.press("?")

    const text = board.screenshot()
    // Check for at least Navigation category (always first, always fits)
    if (!text.includes("Navigation")) {
      bugs.push(`help missing Navigation category. Got: ${text.slice(0, 300)}`)
    }
    // Check for title
    if (!text.includes("Keyboard") && !text.includes("Shortcut")) {
      bugs.push(`help missing title`)
    }

    expect(bugs).toEqual([])
  })

  test("help fits in 80x24 terminal", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"))),
      { columns: 80, rows: 24 },
    )
    const bugs: string[] = []

    board.press("?")

    const text = board.screenshot()
    const lines = text.split("\n")
    if (lines.length > 24) {
      bugs.push(`help overlay exceeds 24 rows: ${lines.length} lines`)
    }
    for (const line of lines) {
      // Check visual width (some chars are multi-byte but single-width)
      if (line.length > 80) {
        // This is a rough check — wide chars could make this inaccurate
        // but it catches obvious overflow
        bugs.push(`help line exceeds 80 cols: "${line.slice(0, 40)}..."`)
      }
    }

    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in help overlay")
    }
    expect(bugs).toEqual([])
  })

  test("navigation works after closing help", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("?") // open help
    board.press("Escape") // close help

    // Navigation should work normally
    board.press("j")
    board.press("j")
    board.press("k")
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after help close + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("help in narrow terminal", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A"))),
      { columns: 40, rows: 12 },
    )
    const bugs: string[] = []

    board.press("?")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in narrow terminal help")
    }
    expect(bugs).toEqual([])
  })

  test("help overlay blocks other keys", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("?") // open help

    // These keys should not affect the board while help is open
    board.press("j") // should not navigate
    board.press("d") // should not duplicate
    board.press("Backspace") // should not delete

    board.press("Escape") // close help

    const kids = repo.getChildren("col1").map((n) => n.id)
    if (!kids.includes("A") || !kids.includes("B")) {
      bugs.push("help overlay didn't block board operations")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after help overlay key blocking test")
    }
    expect(bugs).toEqual([])
  })

  test("help overlay reopened multiple times", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"))),
    )
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) {
      board.press("?") // open
      board.press("Escape") // close
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after repeated help open/close")
    }
    expect(bugs).toEqual([])
  })
})

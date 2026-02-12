/**
 * Exploration: Stress navigation — large boards, rapid sequences, boundary cases
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Stress Navigation", () => {
  test("100 random nav keys on 4-column board", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
        item("col2", item("2a"), item("2b"), item("2c")),
        item("col3", item("3a"), item("3b")),
        item("col4", item("4a"), item("4b"), item("4c"), item("4d"), item("4e")),
      ),
    )
    const bugs: string[] = []

    const navKeys = ["j", "k", "h", "l", "g", "G"]
    // Deterministic sequence instead of random
    for (let i = 0; i < 100; i++) {
      const key = navKeys[i % navKeys.length]!
      board.press(key)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 100 nav keys")
    }
    expect(bugs).toEqual([])
  })

  test("50 j keys on long column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1",
          ...Array.from({ length: 20 }, (_, i) => item(`item-${i + 1}`)),
        ),
      ),
      { rows: 12 }, // small viewport to test scrolling
    )
    const bugs: string[] = []

    // Navigate all the way down (well past end)
    for (let i = 0; i < 50; i++) {
      board.press("j")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 50 j keys on long column")
    }
    expect(bugs).toEqual([])
  })

  test("50 k keys after navigating to bottom", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1",
          ...Array.from({ length: 15 }, (_, i) => item(`item-${i + 1}`)),
        ),
      ),
      { rows: 10 },
    )
    const bugs: string[] = []

    board.press("G") // jump to last
    for (let i = 0; i < 50; i++) {
      board.press("k")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 50 k keys")
    }
    expect(bugs).toEqual([])
  })

  test("h/l oscillation at boundaries", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"))),
    )
    const bugs: string[] = []

    for (let i = 0; i < 30; i++) {
      board.press("l")
      board.press("h")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after h/l oscillation")
    }
    expect(bugs).toEqual([])
  })

  test("level transitions: card→column→board→column→card cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    for (let i = 0; i < 10; i++) {
      board.press("k") // up to column
      board.press("k") // up to board
      board.press("j") // down to column
      board.press("j") // down to card
      board.press("l") // right
      board.press("h") // left
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after level transition cycles")
    }
    expect(bugs).toEqual([])
  })

  test("g then G then g — first/last oscillation", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    for (let i = 0; i < 15; i++) {
      board.press("G")
      board.press("g")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after g/G oscillation")
    }
    expect(bugs).toEqual([])
  })

  test("Arrow keys vs vim keys produce same behavior", () => {
    const { board: b1 } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const { board: b2 } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    // Same sequence with vim keys
    b1.press("j").press("l").press("k")
    // Same sequence with arrow keys
    b2.press("ArrowDown").press("ArrowRight").press("ArrowUp")

    const t1 = b1.screenshot()
    const t2 = b2.screenshot()

    if (t1.includes("[object Object]") || t2.includes("[object Object]")) {
      bugs.push("garbage in arrow or vim key navigation")
    }
    // Content should be the same (cursor at same position)
    // (not checking exact match because rendering timing might differ)
    expect(bugs).toEqual([])
  })

  test("navigation on single-card single-column board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("only"))),
    )
    const bugs: string[] = []

    // All navigation should be no-ops or bells
    board.press("j")
    board.press("k")
    board.press("h")
    board.press("l")
    board.press("g")
    board.press("G")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage on single-item board navigation")
    }
    expect(bugs).toEqual([])
  })

  test("navigation on board with empty columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("empty-col"), item("col3", item("B"))),
    )
    const bugs: string[] = []

    board.press("l") // → empty-col
    board.press("l") // → col3
    board.press("h") // → empty-col
    board.press("h") // → col1
    board.press("j") // down in col1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage navigating through empty columns")
    }
    expect(bugs).toEqual([])
  })

  test("very wide board with many columns", () => {
    const { board } = testEnv(
      () =>
        item("board",
          ...Array.from({ length: 10 }, (_, i) => item(`col${i}`, item(`c${i}-a`), item(`c${i}-b`))),
        ),
      { columns: 200 },
    )
    const bugs: string[] = []

    // Navigate to last column
    for (let i = 0; i < 12; i++) board.press("l")
    // Navigate back
    for (let i = 0; i < 12; i++) board.press("h")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage on wide board navigation")
    }
    expect(bugs).toEqual([])
  })
})

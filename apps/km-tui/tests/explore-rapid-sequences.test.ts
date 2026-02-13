/**
 * Exploration: Rapid key sequences — fast repetitions of operations
 * to catch timing/state-management bugs.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Rapid Sequences", () => {
  test("20 rapid j presses", () => {
    const { board } = testEnv(() => {
      const items = Array.from({ length: 10 }, (_, i) => item(`item${i}`))
      return item("board", item("col1", ...items))
    })
    const bugs: string[] = []

    for (let i = 0; i < 20; i++) board.press("j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 20 rapid j")
    }
    expect(bugs).toEqual([])
  })

  test("rapid j/k alternation", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    for (let i = 0; i < 20; i++) {
      board.press("j")
      board.press("k")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid j/k alternation")
    }
    expect(bugs).toEqual([])
  })

  test("rapid fold/unfold", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2"), item("c3")), item("B"))),
    )
    const bugs: string[] = []

    for (let i = 0; i < 10; i++) {
      board.press("z").press("a")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid fold/unfold")
    }
    expect(bugs).toEqual([])
  })

  test("rapid duplicate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 8; i++) board.press("d")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 8 rapid duplicates")
    }
    expect(bugs).toEqual([])
  })

  test("rapid undo after duplicates", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) board.press("d")
    for (let i = 0; i < 5; i++) board.press("Ctrl+Z")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid dup then undo")
    }
    expect(bugs).toEqual([])
  })

  test("rapid x task status cycling", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("T1", "todo"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 15; i++) board.press("x")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after 15 rapid x cycles")
    }
    expect(bugs).toEqual([])
  })

  test("rapid space (detail pane toggle)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 10; i++) board.press(" ")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid space toggles")
    }
    expect(bugs).toEqual([])
  })

  test("rapid enter/escape (inline edit)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 8; i++) {
      board.press("Enter")
      board.press("Escape")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid enter/escape")
    }
    expect(bugs).toEqual([])
  })

  test("rapid Ctrl+D/Ctrl+U page navigation", () => {
    const { board } = testEnv(() => {
      const items = Array.from({ length: 30 }, (_, i) => item(`item${i}`))
      return item("board", item("col1", ...items))
    })
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) board.press("Ctrl+D")
    for (let i = 0; i < 5; i++) board.press("Ctrl+U")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid page nav")
    }
    expect(bugs).toEqual([])
  })

  test("rapid selection extend and clear", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))
    const bugs: string[] = []

    for (let i = 0; i < 4; i++) board.press("J") // select down
    board.press("Escape") // clear
    for (let i = 0; i < 3; i++) board.press("J") // select again
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid select/clear")
    }
    expect(bugs).toEqual([])
  })
})

/**
 * Exploration: View mode switching — Ctrl+T toggles between cards and columns view.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: View Mode", () => {
  test("Ctrl+T switches to columns view", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Ctrl+T") // switch to columns view

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Ctrl+T view switch")
    }
    expect(bugs).toEqual([])
  })

  test("Ctrl+T twice returns to cards", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Ctrl+T")
    board.press("Ctrl+T")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after double Ctrl+T")
    }
    expect(bugs).toEqual([])
  })

  test("view switch then navigation", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("Ctrl+T") // columns view
    board.press("j")
    board.press("k")
    board.press("Ctrl+T") // back to cards
    board.press("j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after view switch + nav")
    }
    expect(bugs).toEqual([])
  })

  test("view switch with folder", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("Ctrl+T") // columns view
    board.press("j") // navigate
    board.press("Ctrl+T") // back to cards

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after view switch with folder")
    }
    expect(bugs).toEqual([])
  })

  test("view switch then fold", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("Ctrl+T")
    board.press("z").press("a") // fold in columns view
    board.press("Ctrl+T") // switch back

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after view switch + fold")
    }
    expect(bugs).toEqual([])
  })

  test("rapid view switching", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 8; i++) {
      board.press("Ctrl+T")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid view switching")
    }
    expect(bugs).toEqual([])
  })
})

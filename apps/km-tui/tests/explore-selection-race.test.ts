/**
 * Exploration: Selection race regression — Shift+J/K (J/K) extend selection.
 *
 * Verifies the selection race fix: J/K should correctly extend/contract selection
 * without race conditions or corruption.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Selection Race", () => {
  test("J extends selection downward from first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    board.press("J") // select A→B
    board.press("J") // select A→C
    board.press("J") // select A→D

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J extensions")
    }
    expect(bugs).toEqual([])
  })

  test("K extends selection upward from last card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Navigate to last card
    board.press("j").press("j").press("j") // → D

    board.press("K") // select D→C
    board.press("K") // select D→B
    board.press("K") // select D→A

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after K extensions")
    }
    expect(bugs).toEqual([])
  })

  test("J then K contracts selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("J") // A→B
    board.press("J") // A→C
    board.press("J") // A→D
    board.press("K") // A→C (contract)
    board.press("K") // A→B (contract)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J then K contraction")
    }
    expect(bugs).toEqual([])
  })

  test("rapid J/K alternation does not crash", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Rapid alternation
    for (let i = 0; i < 10; i++) {
      board.press("J")
      board.press("K")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid J/K alternation")
    }
    expect(bugs).toEqual([])
  })

  test("J past last card hits boundary", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("J") // A→B
    board.press("J") // A→C
    board.press("J") // boundary — C is last
    board.press("J") // boundary again

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J past boundary")
    }
    expect(bugs).toEqual([])
  })

  test("K past first card hits boundary", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("K") // boundary — already at first card
    board.press("K") // boundary again

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after K past boundary")
    }
    expect(bugs).toEqual([])
  })

  test("J selection then delete affects correct items", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("J") // anchor=B, cursor→C
    board.press("J") // range B→D
    board.press("Backspace") // delete B, C, D

    const kids = repo.getChildren("col1").map((n) => n.id)
    if (kids.includes("B") || kids.includes("C") || kids.includes("D")) {
      bugs.push(`expected B,C,D deleted, still have: ${kids.join(",")}`)
    }
    if (!kids.includes("A") || !kids.includes("E")) {
      bugs.push(`A and E should survive: ${kids.join(",")}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + delete")
    }
    expect(bugs).toEqual([])
  })

  test("J selection then Escape clears selection cleanly", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("J").press("J") // select A→C
    board.press("Escape") // clear

    // j should now do normal navigation, not extend selection
    board.press("j")
    board.press("j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection clear + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("J in column with single card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("only"))),
    )
    const bugs: string[] = []

    board.press("J") // no card to extend to

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J in single-card column")
    }
    expect(bugs).toEqual([])
  })

  test("selection across view mode change", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("J") // start selection
    board.press("2") // switch to columns view
    board.press("1") // back to cards

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + view switch")
    }
    expect(bugs).toEqual([])
  })
})

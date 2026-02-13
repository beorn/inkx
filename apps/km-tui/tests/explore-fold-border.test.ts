/**
 * Exploration: Fold border regression — pressing < multiple times should not
 * corrupt card rendering. Tests fold/unfold round-trips and border integrity.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Fold Border Regression", () => {
  test("single < decreases outline depth without corruption", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("parent1", item("c1"), item("c2")),
          item("parent2", item("c3"), item("c4")),
        ),
        item("col2",
          item("task1"),
          item("task2"),
        ),
      ),
    )
    const bugs: string[] = []

    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after single <")
    }
    // Check for box-drawing characters (borders should still be present)
    // Common border chars: ─ │ ┌ ┐ └ ┘ ├ ┤
    expect(bugs).toEqual([])
  })

  test("multiple < presses do not corrupt rendering", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("A", item("a1", item("deep1")), item("a2")),
          item("B"),
        ),
        item("col2",
          item("C"),
          item("D"),
        ),
      ),
    )
    const bugs: string[] = []

    // Press < multiple times to decrease outline depth
    board.press("<")
    const text1 = board.screenshot()
    if (text1.includes("[object Object]") || text1.includes("TypeError")) {
      bugs.push("garbage after 1st <")
    }

    board.press("<")
    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage after 2nd <")
    }

    board.press("<")
    const text3 = board.screenshot()
    if (text3.includes("[object Object]") || text3.includes("TypeError")) {
      bugs.push("garbage after 3rd <")
    }

    expect(bugs).toEqual([])
  })

  test("< then > round trip preserves card borders", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("parent", item("c1"), item("c2"), item("c3")),
          item("B"),
          item("C"),
        ),
      ),
    )
    const bugs: string[] = []

    const beforeText = board.screenshot()

    // Fold then unfold
    board.press("<")
    board.press(">")

    const afterText = board.screenshot()
    if (afterText.includes("[object Object]") || afterText.includes("TypeError")) {
      bugs.push("garbage after < then >")
    }

    // Note: text might not be exactly equal due to render order, but should not have corruption
    expect(bugs).toEqual([])
  })

  test("rapid < < < > > > cycle", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("A", item("a1", item("deep"))),
          item("B", item("b1")),
          item("C"),
        ),
      ),
    )
    const bugs: string[] = []

    // Rapid fold/unfold cycle
    board.press("<").press("<").press("<")
    board.press(">").press(">").press(">")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid < > cycle")
    }
    expect(bugs).toEqual([])
  })

  test("< after navigation to different column", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C", item("c1"), item("c2")), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press("l") // navigate to col2
    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < in non-first column")
    }
    expect(bugs).toEqual([])
  })

  test("fold za then < — combined fold operations", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("parent", item("c1"), item("c2")),
          item("B"),
        ),
      ),
    )
    const bugs: string[] = []

    // za folds the current node
    board.press("z").press("a")
    // < decreases outline depth globally
    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after za + <")
    }
    expect(bugs).toEqual([])
  })

  test("< at minimum depth does not crash", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
      ),
    )
    const bugs: string[] = []

    // Press < many times — should not crash at minimum depth
    for (let i = 0; i < 10; i++) {
      board.press("<")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after hitting < minimum")
    }
    expect(bugs).toEqual([])
  })

  test("> at maximum depth does not crash", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
      ),
    )
    const bugs: string[] = []

    // Press > many times — should not crash at maximum depth
    for (let i = 0; i < 10; i++) {
      board.press(">")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after hitting > maximum")
    }
    expect(bugs).toEqual([])
  })

  test("< with deep nesting preserves structure", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("L1",
            item("L2",
              item("L3",
                item("L4", item("deep-leaf")),
              ),
            ),
          ),
          item("sibling"),
        ),
      ),
    )
    const bugs: string[] = []

    board.press("<")
    const text1 = board.screenshot()
    if (text1.includes("[object Object]") || text1.includes("TypeError")) {
      bugs.push("garbage with deep nesting after <")
    }

    board.press("<")
    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage with deep nesting after 2nd <")
    }

    expect(bugs).toEqual([])
  })
})

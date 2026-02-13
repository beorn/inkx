/**
 * Exploration: Fold depth changes with < key — specifically testing the
 * reported bug where folding with '<' a few times causes card bottom border
 * to disappear. Also tests > (increase depth) interactions.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Fold Depth Border", () => {
  test("repeated < on folder does not lose borders", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("child1"),
          item("child2"),
          item("child3"),
        ),
        item("B"),
      )),
    )
    const bugs: string[] = []

    // Repeatedly decrease outline depth
    board.press("<")
    board.press("<")
    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after repeated < on folder")
    }
    expect(bugs).toEqual([])
  })

  test("< then > on folder preserves layout", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("child1"),
          item("child2"),
        ),
        item("B"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    board.press("<") // decrease depth
    board.press("<") // decrease more
    board.press(">") // increase
    board.press(">") // back to original

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < > depth cycling")
    }
    expect(bugs).toEqual([])
  })

  test("< on deeply nested structure", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("L1",
          item("L2",
            item("L3",
              item("deep1"),
              item("deep2"),
            ),
          ),
        ),
        item("sibling"),
      )),
    )
    const bugs: string[] = []

    // Collapse depth step by step
    for (let i = 0; i < 5; i++) {
      board.press("<")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after repeated < on deep nesting")
    }
    expect(bugs).toEqual([])
  })

  test("< on leaf node (no children)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("<") // < on leaf — should be no-op or minimal effect

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < on leaf node")
    }
    expect(bugs).toEqual([])
  })

  test("> on leaf node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press(">") // > on leaf

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after > on leaf node")
    }
    expect(bugs).toEqual([])
  })

  test("fold za then < then unfold", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )
    const bugs: string[] = []

    board.press("z").press("a") // fold
    board.press("<") // decrease depth while folded

    const text1 = board.screenshot()
    if (text1.includes("[object Object]") || text1.includes("TypeError")) {
      bugs.push("garbage after fold + <")
    }

    board.press("z").press("a") // unfold

    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage after fold + < + unfold")
    }
    expect(bugs).toEqual([])
  })

  test("< with multiple columns", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("p1", item("a1"), item("a2")),
          item("x"),
        ),
        item("col2",
          item("p2", item("b1"), item("b2")),
          item("y"),
        ),
      ),
    )
    const bugs: string[] = []

    board.press("<")
    board.press("l") // navigate to col2
    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < on multiple columns")
    }
    expect(bugs).toEqual([])
  })

  test("rapid < > alternation", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("child1"),
          item("child2"),
        ),
        item("B"),
      )),
    )
    const bugs: string[] = []

    for (let i = 0; i < 10; i++) {
      board.press("<")
      board.press(">")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid < > alternation")
    }
    expect(bugs).toEqual([])
  })

  test("< on narrow terminal", () => {
    const { board } = testEnv(
      () => item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
      { columns: 30, rows: 10 },
    )
    const bugs: string[] = []

    board.press("<")
    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < on narrow terminal")
    }
    expect(bugs).toEqual([])
  })

  test("< then navigate then < again", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("child1"),
          item("child2"),
        ),
        item("B"),
        item("C"),
      )),
    )
    const bugs: string[] = []

    board.press("<")
    board.press("j") // navigate down
    board.press("<")
    board.press("j") // navigate more
    board.press("<")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < + nav + < pattern")
    }
    expect(bugs).toEqual([])
  })
})

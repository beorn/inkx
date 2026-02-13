/**
 * Exploration: Border integrity — verify card borders (╭╮╰╯) remain intact
 * after various operations, especially depth changes with < key.
 * Specifically targets the reported bug: folding with '<' causes bottom border
 * to disappear.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Count rounded border corners in text */
function countCorners(text: string) {
  return {
    topLeft: (text.match(/╭/g) || []).length,
    topRight: (text.match(/╮/g) || []).length,
    bottomLeft: (text.match(/╰/g) || []).length,
    bottomRight: (text.match(/╯/g) || []).length,
  }
}

/** Check that border corners are balanced (each top has matching bottom) */
function checkBorderBalance(text: string): string[] {
  const c = countCorners(text)
  const bugs: string[] = []
  if (c.topLeft !== c.bottomLeft) {
    bugs.push(`unbalanced left borders: ${c.topLeft} ╭ vs ${c.bottomLeft} ╰`)
  }
  if (c.topRight !== c.bottomRight) {
    bugs.push(`unbalanced right borders: ${c.topRight} ╮ vs ${c.bottomRight} ╯`)
  }
  if (c.topLeft !== c.topRight) {
    bugs.push(`unbalanced top corners: ${c.topLeft} ╭ vs ${c.topRight} ╮`)
  }
  return bugs
}

describe("Exploration: Border Integrity", () => {
  test("basic board has balanced borders", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in basic board")
    }
    expect(bugs).toEqual([])
  })

  test("borders after single <", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )

    board.press("<")

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after single <")
    }
    expect(bugs).toEqual([])
  })

  test("borders after repeated < (depth to 0)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent",
          item("child1"),
          item("child2"),
        ),
        item("B"),
      )),
    )

    // Press < enough times to reach depth 0
    for (let i = 0; i < 5; i++) {
      board.press("<")
    }

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after repeated <")
    }
    expect(bugs).toEqual([])
  })

  test("borders after < then >", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )

    board.press("<")
    board.press("<")
    board.press(">")

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < < >")
    }
    expect(bugs).toEqual([])
  })

  test("borders with deeply nested folder after <", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("L1",
          item("L2",
            item("L3", item("deep")),
          ),
        ),
        item("sibling"),
      )),
    )

    board.press("<")
    const text1 = board.screenshot()
    const bugs1 = checkBorderBalance(text1)

    board.press("<")
    const text2 = board.screenshot()
    const bugs2 = checkBorderBalance(text2)

    board.press("<")
    const text3 = board.screenshot()
    const bugs3 = checkBorderBalance(text3)

    const allBugs = [
      ...bugs1.map((b) => `after 1st <: ${b}`),
      ...bugs2.map((b) => `after 2nd <: ${b}`),
      ...bugs3.map((b) => `after 3rd <: ${b}`),
    ]
    expect(allBugs).toEqual([])
  })

  test("borders after fold za", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )

    board.press("z").press("a") // fold

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold")
    }
    expect(bugs).toEqual([])
  })

  test("borders after fold then <", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
        item("C"),
      )),
    )

    board.press("z").press("a") // fold parent
    board.press("<") // decrease depth

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold + <")
    }
    expect(bugs).toEqual([])
  })

  test("borders with multiple columns after <", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1",
          item("p1", item("a"), item("b")),
          item("X"),
        ),
        item("col2",
          item("p2", item("c"), item("d")),
          item("Y"),
        ),
      ),
    )

    board.press("<")

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < with multi-column")
    }
    expect(bugs).toEqual([])
  })

  test("borders on narrow terminal after <", () => {
    const { board } = testEnv(
      () => item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
      { columns: 30, rows: 15 },
    )

    board.press("<")
    board.press("<")

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < on narrow terminal")
    }
    expect(bugs).toEqual([])
  })

  test("borders after za fold + za unfold cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
      )),
    )

    for (let i = 0; i < 3; i++) {
      board.press("z").press("a") // toggle fold
    }

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold/unfold cycle")
    }
    expect(bugs).toEqual([])
  })

  test("borders after < navigate < navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("B"),
        item("C"),
        item("D"),
      )),
    )

    board.press("<")
    board.press("j") // navigate
    board.press("<")
    board.press("j") // navigate more

    const text = board.screenshot()
    const bugs = checkBorderBalance(text)
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < + nav + < + nav")
    }
    expect(bugs).toEqual([])
  })
})

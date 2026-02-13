/**
 * Exploration: Heading depth fix — creating sections among embeds should use
 * correct heading depth (parent depth + 1, not sibling depth when sibling
 * has no heading depth).
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Heading Depth", () => {
  test("new item creation (n) does not crash", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("n") // create new item below A

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after n (new item)")
    }
    expect(bugs).toEqual([])
  })

  test("new item above (p) does not crash", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("j") // → B
    board.press("p") // create new item above B

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after p (new item above)")
    }
    expect(bugs).toEqual([])
  })

  test("new item in column with nested sections", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.section("S1", item("task1")), item.section("S2", item("task2")))),
    )
    const bugs: string[] = []

    // Navigate to S1, then create new item
    board.press("n")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after n in nested section column")
    }
    expect(bugs).toEqual([])
  })

  test("new item among mixed types (paragraphs + sections)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item.paragraph("intro"),
          item.section("Section 1", item("task1")),
          item.section("Section 2", item("task2")),
        ),
      ),
    )
    const bugs: string[] = []

    // Navigate past virtual body to first section, then create
    board.press("j")
    board.press("n")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after n among mixed types")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate in deeply nested structure", () => {
    const { board } = testEnv(() => item("board", item("col1", item("L1", item("L2", item("L3", item("deep-task")))))))
    const bugs: string[] = []

    board.press("d") // duplicate L1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after duplicate in deep nesting")
    }
    expect(bugs).toEqual([])
  })

  test("new item after embeds (link_to nodes)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("task1"), item("task2"), item("task3"))))
    const bugs: string[] = []

    // Make task2 an embed by setting link_to
    repo.updateNode("task2", { link_to: "task1" })

    board.press("j") // → task2 (embed)
    board.press("n") // new item after embed

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after n next to embed")
    }
    expect(bugs).toEqual([])
  })
})

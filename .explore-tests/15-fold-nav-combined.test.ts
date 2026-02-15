/**
 * Exploration: Fold/unfold combined with navigation.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("fold + navigation combined", () => {
  test("fold then navigate to sibling works", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("c1"), item("c2")),
            item("sibling"),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold parent
    board.press("z").press("a")

    // Navigate down to sibling
    board.press("j")
    board.expect("#sibling[data-cursor]").toExist()
  })

  test("fold then unfold maintains cursor position", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("c1"), item("c2")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold
    board.press("z").press("a")
    board.expect("#parent[data-cursor]").toExist()

    // Unfold
    board.press("z").press("a")
    board.expect("#parent[data-cursor]").toExist()

    // Children should be visible again
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("c1")
    expect(text).toContain("c2")
  })

  test("fold all (zM) then unfold all (zR)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("p1", item("a1"), item("a2")),
            item("p2", item("b1")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold all
    board.press("z").press("M")

    let text = stripAnsi(board.screenshot())
    expect(text).not.toContain("a1")
    expect(text).not.toContain("b1")

    // Unfold all
    board.press("z").press("R")

    text = stripAnsi(board.screenshot())
    expect(text).toContain("a1")
    expect(text).toContain("b1")
  })

  test("navigate across columns with folded nodes", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1",
            item("parent", item("c1"), item("c2")),
            item("task1"),
          ),
          item("col2", item("taskA"), item("taskB")),
        ),
      { columns: 80, rows: 24 },
    )

    // Fold parent
    board.press("z").press("a")

    // Navigate down to task1
    board.press("j")
    board.expect("#task1[data-cursor]").toExist()

    // Navigate right to col2
    board.press("l")
    const cursor = board.q("[data-cursor]").textContent()
    expect(cursor).toMatch(/taskA|taskB/)
  })
})

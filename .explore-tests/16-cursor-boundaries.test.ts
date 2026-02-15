/**
 * Exploration: Cursor at boundaries — first/last item, first/last column.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("cursor boundary behavior", () => {
  test("k at first card goes to column header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first"), item("second")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#first[data-cursor]").toExist()

    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
  })

  test("k at column header goes to board level", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first")),
        ),
      { columns: 80, rows: 24 },
    )

    // Go to column header
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Go to board level
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
  })

  test("k at board level is boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to board level
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // k again should stay at board (boundary)
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
  })

  test("j at last card in column is boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("first"), item("last")),
        ),
      { columns: 80, rows: 24 },
    )

    board.press("j")
    board.expect("#last[data-cursor]").toExist()

    // j should be boundary
    board.press("j")
    board.expect("#last[data-cursor]").toExist()
  })

  test("h at leftmost column is boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#a1[data-cursor]").toExist()

    // h should be boundary
    board.press("h")
    board.expect("#a1[data-cursor]").toExist()
  })

  test("l at rightmost column is boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
        ),
      { columns: 80, rows: 24 },
    )

    // Go to rightmost column
    board.press("l")
    board.expect("#b1[data-cursor]").toExist()

    // l should be boundary
    board.press("l")
    board.expect("#b1[data-cursor]").toExist()
  })

  test("j from board level goes to first column header", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to board level
    board.press("k").press("k")
    board.expect("#board[data-cursor]").toExist()

    // j from board should go to a column
    board.press("j")
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    // Should be on col1 header
    board.expect("#col1[data-cursor]").toExist()
  })

  test("rapid j/k oscillation does not corrupt cursor state", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a"), item("b"), item("c")),
        ),
      { columns: 80, rows: 24 },
    )

    // Rapid oscillation
    for (let i = 0; i < 10; i++) {
      board.press("j")
      board.press("k")
    }

    // Cursor should be on first card (net movement = 0)
    board.expect("#a[data-cursor]").toExist()
  })

  test("rapid h/l oscillation does not corrupt cursor state", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1")),
          item("col2", item("b1")),
        ),
      { columns: 80, rows: 24 },
    )

    // Rapid oscillation
    for (let i = 0; i < 10; i++) {
      board.press("l")
      board.press("h")
    }

    // Cursor should be on first column card (net movement = 0)
    board.expect("#a1[data-cursor]").toExist()
  })
})

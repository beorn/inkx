import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("shift card boundary detection", () => {
  test("shift up at top card returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item("a"), item("b"), item("c"))),
      { columns: 60, rows: 20 },
    )
    // Cursor is on first card — shift up should hit boundary
    board.press("Meta+k")
    expect(board.bell).toBe(true)
  })

  test("shift down at bottom card returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item("a"), item("b"))),
      { columns: 60, rows: 20 },
    )
    board.press("j") // move to last card
    board.press("Meta+j") // shift down at bottom
    expect(board.bell).toBe(true)
  })

  test("shift left at leftmost column returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a")), item("Col2", item("b"))),
      { columns: 80, rows: 20 },
    )
    // Cursor on Col1 card — shift left should hit boundary
    board.press("Meta+h")
    expect(board.bell).toBe(true)
  })

  test("shift right at rightmost column returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a")), item("Col2", item("b"))),
      { columns: 80, rows: 20 },
    )
    board.press("l") // move to Col2
    board.press("Meta+l") // shift right at rightmost column
    expect(board.bell).toBe(true)
  })

  test("shift down in middle succeeds (no bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item("a"), item("b"), item("c"))),
      { columns: 60, rows: 20 },
    )
    board.press("Meta+j") // shift down from first card — should succeed
    expect(board.bell).toBe(false)
  })

  test("shift up/down at column header returns boundary (bell)", () => {
    const { board } = testEnv(
      () => item("board", item("Col1", item("a")), item("Col2", item("b"))),
      { columns: 80, rows: 20 },
    )
    board.press("k") // move to column header
    board.press("Meta+k") // shift up at header — no card, should hit boundary
    expect(board.bell).toBe(true)
  })
})

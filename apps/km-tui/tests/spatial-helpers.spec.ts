/**
 * Tests for spatial helper methods
 */
import { test, expect, describe } from "vitest"
import { createTestBoard } from "@km/tui/test"

describe("spatial helpers", () => {
  test("at() returns element info with bounding box", () => {
    const board = createTestBoard([
      "Col1 > Task A",
      "Col1 > Task B",
      "Col2 > Task C",
    ])

    const colInfo = board.at("#Col1")
    expect(colInfo.exists).toBe(true)
    expect(colInfo.text).toContain("Task A")
    expect(colInfo.box).toBeDefined()
    if (colInfo.box) {
      expect(colInfo.box.width).toBeGreaterThan(0)
      expect(colInfo.box.height).toBeGreaterThan(0)
    }
  })

  test("columns() returns column info array", () => {
    const board = createTestBoard([
      "Col1 > A",
      "Col1 > B",
      "Col2 > C",
      "Col3 > D",
    ])

    const cols = board.columns()
    expect(cols.length).toBeGreaterThanOrEqual(2) // At least 2 visible in 80 cols
    expect(cols[0].cardCount).toBe(2) // Col1 has 2 cards
    expect(cols[0].hasCursor).toBe(true) // Cursor starts in first column
  })

  test("cards() returns card info array", () => {
    const board = createTestBoard([
      "Col > Task A",
      "Col > Task B",
      "Col > Task C",
    ])

    const cards = board.cards()
    expect(cards.length).toBe(3)
    expect(cards[0].text).toBe("Task A")
    expect(cards[0].column).toBe(0)
    expect(cards[0].hasCursor).toBe(true) // Cursor on first card
  })

  test("cursor moves update card.hasCursor", () => {
    const board = createTestBoard(["Col > A", "Col > B", "Col > C"])

    let cards = board.cards()
    expect(cards[0].hasCursor).toBe(true)
    expect(cards[1].hasCursor).toBe(false)

    board.press("j")

    cards = board.cards()
    expect(cards[0].hasCursor).toBe(false)
    expect(cards[1].hasCursor).toBe(true)
  })
})

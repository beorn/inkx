import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("body column l navigation", () => {
  test("l from body card goes directly to next column card, not board title", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("intro text"),
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Cursor should start on body card
    expect(board.q("[data-cursor]").textContent()).toContain("intro text")

    // Press l to move right
    board.press("l")

    // Should be on col1's first card, NOT the board title
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-a")
  })

  test("l from body card with multiple columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("body content here"),
        item("col1", item("task-a")),
        item("col2", item("task-b")),
      ),
    )

    expect(board.q("[data-cursor]").textContent()).toContain("body content")

    // First l: should go to col1
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")

    // Second l: should go to col2
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-b")
  })

  test("l from body with multiple paragraphs skips all body to next structural column", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("para one"),
        item.paragraph("para two"),
        item.paragraph("para three"),
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Cursor starts on first body card
    expect(board.q("[data-cursor]").textContent()).toContain("para one")

    // Press l - should go to col1's first card, not to para two or board title
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")
  })

  test("h from col1 card goes back to body column", () => {
    const { board } = testEnv(() =>
      item.root(
        "myfile",
        item.paragraph("intro"),
        item("col1", item("task-a")),
      ),
    )

    // Start on body
    expect(board.q("[data-cursor]").textContent()).toContain("intro")

    // Move right to col1
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")

    // Move left back to body
    board.press("h")
    expect(board.q("[data-cursor]").textContent()).toContain("intro")
  })
})

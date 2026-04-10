/**
 * Board Test Helper - Smoke Tests
 *
 * Verifies the board-test helper works correctly. The legacy
 * renderBoard(BoardStateResult)/board()/column()/SIMPLE_BOARD DSL has been
 * removed — new tests should use createDriverTest() + item() or the @km/tui/test API.
 */

import { describe, test, expect } from "vitest"
import { createTestBoard, check, item } from "@km/tui/test"

// =============================================================================
// @km/tui/test API
// =============================================================================

describe("@km/tui/test API", () => {
  test("createTestBoard with string DSL", () => {
    const board = createTestBoard(["Inbox > Task 1", "Projects > Alpha"])

    expect(board.text).toContain("Inbox")
    board.press("j")
    expect(board.text).toContain("Inbox")
  })

  test("createTestBoard with options", () => {
    const board = createTestBoard(["Col > Task"], { viewMode: "list" })

    expect(board.viewMode).toBe("list")
  })

  test("check.all runs all checks", () => {
    const board = createTestBoard(["Col > Task"])

    check.all(board)
  })

  test("individual checks work", () => {
    const board = createTestBoard(["Col > Task"])

    check.rendering(board)
    check.cursor(board)
  })

  test("item() helper available", () => {
    const nodes = item("board", item("Col", item("Task")))
    const board = createTestBoard(nodes)

    expect(board.text).toContain("Task")
  })

  test("fluent chaining", () => {
    const board = createTestBoard(["Col > A", "Col > B", "Col > C"])

    board.press("j").press("j")
    expect(board.cursor.card).toBe(2)
  })
})

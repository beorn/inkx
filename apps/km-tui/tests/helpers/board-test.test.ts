/**
 * Board Test Helper - Smoke Tests
 *
 * Verifies the board-test helper works correctly.
 */

import { describe, test, expect } from "vitest"
import { renderBoard, board, column, SIMPLE_BOARD } from "./board-test.ts"
import { createTestBoard, check, item } from "@km/tui/test"

describe("board-test helper", () => {
  test("renderBoard creates a board test instance", () => {
    const b = renderBoard(SIMPLE_BOARD)
    expect(b).toBeDefined()
    expect(typeof b.press).toBe("function")
    expect(typeof b.expectVisible).toBe("function")
    expect(typeof b.screenshot).toBe("function")
  })

  test.todo("screenshot returns rendered text — needs renderBoard rewrite for lens-based Column", () => {
    const b = renderBoard(SIMPLE_BOARD)
    const text = b.screenshot()
    expect(text).toContain("To Do")
    expect(text).toContain("Task 1")
  })

  test("board() fixture DSL creates valid board state", () => {
    const state = board({
      columns: [column("My Column", ["Task A", "Task B"])],
    })

    expect(state.columns).toHaveLength(1)
    expect(state.columns[0]?.cardNodes).toHaveLength(2)
    expect(state.columns[0]?.node.content).toBe("My Column")
  })

  test.todo("expectVisible asserts text is in output — needs renderBoard rewrite for lens-based Column", () => {
    const b = renderBoard(SIMPLE_BOARD)
    // Should not throw
    b.expectVisible("Task 1")
    b.expectVisible("To Do")
  })

  test("press sends key but does not change state (BoardCore limitation)", () => {
    const b = renderBoard(SIMPLE_BOARD)
    // NOTE: press() won't actually change navigation state because BoardCore
    // is a pure rendering component. For interactive testing, use Board which
    // includes useReducer and useInput.
    b.press("l")
    // Should still render without crashing
    expect(b.screenshot()).toBeDefined()
  })
})

// =============================================================================
// @km/tui/test API (absorbed from test-api.spec.ts)
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

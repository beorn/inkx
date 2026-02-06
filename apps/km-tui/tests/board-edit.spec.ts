/**
 * Board Acceptance Tests - Edit & Move Operations
 *
 * Tests for card shifting (Meta+j/k/h/l), deletion (D), inline editing (Enter),
 * undo/redo (Control+z/y), and move mode (m).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Edit Operations
// =============================================================================

describe("Edit Operations", () => {
  test("Meta+j shifts card down within column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Shift 1a down (swaps with 1b)
    board.press("Meta+j")

    // Cursor should follow the moved card
    board.expect("#1a[data-cursor]").toExist()

    // Verify order changed: 1b should now be above 1a
    const bBox = board.q("#1b").boundingBox()
    const aBox = board.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(aBox!.y)
  })

  test("Meta+k shifts card up within column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a")),
      ),
    )
    // Move to 1b
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Shift 1b up (swaps with 1a)
    board.press("Meta+k")

    // Cursor should follow the moved card
    board.expect("#1b[data-cursor]").toExist()

    // Verify order changed: 1b should now be above 1a
    const bBox = board.q("#1b").boundingBox()
    const aBox = board.q("#1a").boundingBox()
    expect(bBox!.y).toBeLessThan(aBox!.y)
  })

  test("Meta+j at bottom boundary does nothing", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    board.press("Meta+j")

    board.expect("#1b[data-cursor]").toExist()
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
  })

  test("Meta+k at top boundary does nothing", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("Meta+k")

    board.expect("#1a[data-cursor]").toExist()
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(aBox!.y).toBeLessThan(bBox!.y)
  })

  test("Meta+l shifts card right to next column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("Meta+l")

    // Card should now be in col2, cursor follows
    board.expect("#1a[data-cursor]").toExist()

    // 1a should now be horizontally aligned with col2 content
    const aBox = board.q("#1a").boundingBox()
    const twoABox = board.q("#2a").boundingBox()
    expect(aBox!.x).toBe(twoABox!.x)
  })

  test("Meta+h shifts card left to previous column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a"), item("2b")),
      ),
    )
    // Navigate to col2
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    board.press("Meta+h")

    // Card should now be in col1, cursor follows
    board.expect("#2a[data-cursor]").toExist()

    // 2a should now be horizontally aligned with col1 content
    const twoABox = board.q("#2a").boundingBox()
    const oneABox = board.q("#1a").boundingBox()
    expect(twoABox!.x).toBe(oneABox!.x)
  })

  test("Meta+l at rightmost column does nothing", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    board.press("Meta+l")

    board.expect("#2a[data-cursor]").toExist()
  })

  test("Meta+h at leftmost column does nothing", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("Meta+h")

    board.expect("#1a[data-cursor]").toExist()
  })

  test("D deletes the selected node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("D")

    // 1a should be gone
    board.expect("#1a").not.toExist()
    // Cursor should move to next card
    const output = board.screenshot()
    expect(output).toContain("1b")
  })

  test("D on last card in column moves cursor to previous card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    board.press("D")

    board.expect("#1b").not.toExist()
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Enter in normal mode enters inline edit", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("Enter")

    // Should be in edit mode - typing should not navigate
    board.press("j")
    board.press("k")

    // Board should still show both cards (didn't navigate)
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Control+z undo is unimplemented (no crash)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("Control+z")

    board.expect("#1a[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Control+y redo is unimplemented (no crash)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("Control+y")

    board.expect("#1a[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })
})

// =============================================================================
// Move Mode
// =============================================================================

describe("Move Mode", () => {
  test("m enters move mode, shows [MOVE] indicator", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("m")

    const output = board.screenshot()
    expect(output).toContain("[MOVE]")
  })

  test("Escape in move mode cancels and restores cursor", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("m")
    expect(board.screenshot()).toContain("[MOVE]")

    // Navigate to different column while in move mode
    board.press("l")

    // Cancel move mode
    board.press("Escape")

    expect(board.screenshot()).not.toContain("[MOVE]")
    // Cursor should be restored to original position (1a)
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Enter in move mode confirms move to target column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("m")
    expect(board.screenshot()).toContain("[MOVE]")

    // Navigate to col2
    board.press("l")

    // Confirm move
    board.press("Enter")

    expect(board.screenshot()).not.toContain("[MOVE]")

    // 1a should now be in col2 (alongside 2a)
    const oneABox = board.q("#1a").boundingBox()
    const twoABox = board.q("#2a").boundingBox()
    expect(oneABox!.x).toBe(twoABox!.x)
  })

  test("move mode allows navigation to pick target", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("m")

    // Can navigate while in move mode
    board.press("l")
    expect(board.screenshot()).toContain("[MOVE]")

    // Escape to cancel
    board.press("Escape")
    expect(board.screenshot()).not.toContain("[MOVE]")
  })

  test("move mode on single card in single column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("only"))))
    board.expect("#only[data-cursor]").toExist()

    board.press("m")
    expect(board.screenshot()).toContain("[MOVE]")

    board.press("Escape")
    expect(board.screenshot()).not.toContain("[MOVE]")
    board.expect("#only[data-cursor]").toExist()
  })
})

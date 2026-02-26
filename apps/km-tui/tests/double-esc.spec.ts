/**
 * Tests for the double-Escape bug — Bug km-tui.double-esc
 *
 * "Enter edits card but requires double-Esc to exit editing"
 *
 * Root cause: When local find (/) results are visible but the find bar
 * input is closed, pressing Escape during inline editing would fire find_close
 * (clearing search results) instead of text.exit_edit (exiting edit mode).
 * The user had to press Escape twice: once to close find, once to exit edit.
 *
 * Fix: The find_close Escape binding now requires not(isInlineEditing),
 * so text.exit_edit takes priority during inline editing.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("single Escape exits inline edit (km-tui.double-esc)", () => {
  test("single Escape exits inline edit mode to normal mode", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter") // enter edit mode

    // Single Escape should exit edit mode
    board.press("Escape")

    // Verify we're back in normal mode by pressing j to navigate
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("single Escape after typing saves and exits to normal mode", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter")
    board.press("x")
    board.press("y")

    // Single Escape should save and exit
    board.press("Escape")

    // Content should be saved
    expect(repo.getNode("1a")?.content).toBe("1axy")

    // Should be in normal mode — j navigates
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Escape exits edit mode even with local find results visible (regression)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"))))

    // Do a local find (/) to set localSearch state
    board.press("/") // open find bar

    // Type a search term and confirm to keep results visible
    board.press("a")
    board.press("Enter") // confirm find — keeps matches, closes input

    // Now enter edit mode on the card
    board.press("Enter") // edit card "alpha"

    // Type something
    board.press("!")

    // Single Escape should exit edit mode (not close find results)
    board.press("Escape")

    // Content should be saved
    expect(repo.getNode("alpha")?.content).toBe("alpha!")

    // Should be in normal mode — j navigates
    board.press("j")
    board.expect("#beta[data-cursor]").toExist()
  })
})

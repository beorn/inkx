/**
 * Inline Edit Acceptance Tests
 *
 * Tests for inline node editing via Enter key.
 * Verifies the full flow: Enter → edit mode → type → Enter/Escape → confirm/cancel.
 */

import { describe, test, expect, afterEach } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { toastQueue } from "@km/core"

// Clean up toast state between tests
afterEach(() => {
  toastQueue.dismissAll()
})

describe("Inline Editing", () => {
  test("Enter on card enters inline edit, shows editable text", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()

    // Press Enter to start inline editing
    board.press("Enter")

    // The text should still be visible (now in edit mode)
    const output = board.screenshot()
    expect(output).toContain("1a")
  })

  test("Enter on column header enters inline edit", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("k") // card → column
    board.expect("#col1[data-cursor]").toExist()
    board.press("Enter")

    const output = board.screenshot()
    expect(output).toContain("col1")
  })

  test("Enter on board title enters inline edit", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    board.press("k") // card → column
    board.press("k") // column → board
    board.expect("#board[data-cursor]").toExist()
    board.press("Enter")

    const output = board.screenshot()
    expect(output).toContain("board")
  })

  test("typing during inline edit does NOT trigger board commands", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // These keys would navigate/quit in normal mode
    board.press("j")
    board.press("k")
    board.press("q")
    board.press("l")

    // Board should still be intact (didn't quit or navigate)
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")
  })

  test("Escape during inline edit cancels without saving", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Type some characters
    board.press("x")
    board.press("y")
    board.press("z")

    // Cancel with Escape
    board.press("Escape")

    // Original content should be preserved
    const output = board.screenshot()
    expect(output).toContain("1a")

    // Board should be back in normal mode — j should navigate
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Enter confirms inline edit and saves to repo", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.expect("#1a[data-cursor]").toExist()
    board.press("Enter")

    // Append text to existing content
    for (const c of "-edited") board.press(c)

    // Confirm with Enter
    board.press("Enter")

    // The breadcrumb path updates from repo — check it shows the edit
    const output = board.screenshot()
    expect(output).toContain("1a-edited")

    // Board should be back in normal mode
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("inline edit then navigate works (edit → Escape → j/k)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )

    // Edit first card then cancel
    board.press("Enter")
    board.press("Escape")

    // Should be able to navigate normally
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // Edit second card then cancel
    board.press("Enter")
    board.press("Escape")

    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
  })

  test("close_or_quit (Escape) cancels inline edit before other actions", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("Enter")

    // First Escape should cancel inline edit (not quit)
    board.press("Escape")

    // Board should still be showing
    const output = board.screenshot()
    expect(output).toContain("1a")
    expect(output).toContain("1b")

    // Cursor should still be on the edited node
    board.expect("#1a[data-cursor]").toExist()
  })
})

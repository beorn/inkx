/**
 * Bug: Escape does not close the search dialog
 *
 * Bead: km-h9p52
 *
 * When the search dialog is open (via "/"), pressing Escape should close it.
 * Instead, the dialog remains visible — the `[data-dialog="search"]` element
 * persists in the DOM.
 *
 * Root cause hypothesis: The keybinding layer ordering has toast.dismiss
 * (Layer 1 "modal") intercepting Escape before dialog.cancel (Layer 3 "dialog")
 * can fire. Or the text-input layer's text.exit_edit (Layer 5) fires instead
 * of dialog.cancel. Either way, DIALOG_CANCEL never reaches the SearchDialog's
 * cancel() handler via dialogTargetRef.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Bug: Escape does not close search dialog (km-h9p52)", () => {
  function makeBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("col1", item("Alpha task"), item("Beta testing"), item("Gamma ray")),
          item("col2", item("Delta force"), item("Epsilon value")),
        ),
      { columns: 100, rows: 30 },
    )
  }

  test("pressing Escape closes the search dialog", () => {
    const { board } = makeBoard()

    // Open search dialog
    board.press("/")
    expect(board.q('[data-dialog="search"]').count()).toBeGreaterThan(0)

    // Press Escape to close
    board.press("Escape")

    // Search dialog should be gone
    expect(board.q('[data-dialog="search"]').count()).toBe(0)
  })

  test("pressing Escape closes search dialog after typing a query", () => {
    const { board } = makeBoard()

    // Open search, type a query
    board.press("/")
    board.press("a").press("l")
    expect(board.q('[data-dialog="search"]').count()).toBeGreaterThan(0)

    // Press Escape to close
    board.press("Escape")

    // Search dialog should be gone
    expect(board.q('[data-dialog="search"]').count()).toBe(0)
  })

  test("board is navigable after closing search with Escape", () => {
    const { board } = makeBoard()

    // Open and close search
    board.press("/")
    board.press("Escape")

    // Should be able to navigate normally
    board.press("j")
    const text = board.screenshot()
    // Board content should be visible, not a dialog
    expect(text).not.toContain("Type to search")
  })
})

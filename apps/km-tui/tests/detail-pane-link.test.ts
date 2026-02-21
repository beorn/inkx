/**
 * Regression: detail pane stuck open on link-type nodes
 *
 * When opening the detail pane on a link node (e.g., ![[^id]]),
 * pressing Escape or Space should close/toggle it, same as any other node.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("detail pane on link-type nodes", () => {
  test("Space toggles detail pane open and closed on link node", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Navigate to the link node (it's the first card in col1)
    expect(store.getState().cursorNodeId).toBe("link-to-target")

    // Open detail pane with Space
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Close detail pane with Space
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("Escape closes detail pane on link node", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane with Space
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Close with Escape
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("link node whose target has children: Enter zooms instead of detail pane", { timeout: 5000 }, () => {
    // The link target "col2" has children, so Enter should zoom into it, not open detail pane
    const { board, store } = testEnv(
      () =>
        item("board", item("col1", item.link("embed-link", "col2"), item("another-card")), item("col2", item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    // Enter on link node starts inline edit (Enter is bound to enter_inline_edit in normal mode)
    board.press("Enter")
    // Detail pane should NOT open — Enter triggers inline edit, not OPEN_DETAIL_PANE
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("backslash key does NOT toggle detail pane (bound to command palette)", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-to-target", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Backslash is bound to command_palette, not toggle_detail_pane
    board.press("\\")
    expect(store.getState().ui.showDetailPane).toBe(false)

    // Space is the correct key to open detail pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Backslash does NOT close it either
    board.press("\\")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Space closes it
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("detail pane stays closeable after navigating to different card", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-node", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane on link node
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Navigate to next card (regular card)
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("regular-card")

    // Detail pane still open, should close with Space
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("detail pane stays closeable after navigating to different column", { timeout: 5000 }, () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("link-node", "target-id"), item("regular-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane on link node
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Navigate to different column
    board.press("l")
    expect(store.getState().cursorNodeId).toBe("card2")

    // Detail pane still closeable with Escape
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("detail pane closes on link node pointing to existing target", { timeout: 5000 }, () => {
    // The link target exists in the repo
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.link("embed-link", "card2"), item("another-card")),
          item("col2", item("card2")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Close with Space
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })
})

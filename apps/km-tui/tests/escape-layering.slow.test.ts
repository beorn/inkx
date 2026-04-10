/**
 * Escape Layering Tests (km-all.kb-escape)
 *
 * Verifies the escape key pops one layer at a time from the focus stack:
 *
 * 0. Move mode → exit mode
 * 1. Text edit mode → exit to node mode (save edit, cursor stays on node)
 * 2. Pane focused → unfocus pane, return focus to board (pane stays open)
 * 3. Dialog open → close topmost dialog
 * 4. Selection active → collapse to cursor (repeatable, absorbs Escape)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

describe("Escape Layering", () => {
  // ---------------------------------------------------------------------------
  // Layer 0: Move mode
  // ---------------------------------------------------------------------------

  test("Escape cancels move mode", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // Enter move mode with 'mm'
    board.command("enter_move_mode")
    expect(getActiveBoardPane(store.getState())!.moveState.active).toBe(true)

    // Escape cancels move mode
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.moveState.active).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Layer 1: Text edit → node mode
  // ---------------------------------------------------------------------------

  test("Escape exits inline edit mode (saves content, cursor stays on node)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.expect("#task1[data-cursor]").toExist()

    // Enter inline edit mode with 'i'
    board.press("i")
    board.expectEditing("task1")

    // Escape exits edit mode — cursor stays on same node
    board.press("Escape")
    board.expectNotEditing()
    board.expect("#task1[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Layer 2: Pane focused → unfocus pane (pane stays open)
  // ---------------------------------------------------------------------------

  test("Escape from detail pane: unfocus → close", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // D opens + auto-focuses detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Escape 1: unfocus detail → return to board (pane stays open)
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape 2: close pane
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Layer 3: Dialog open → close topmost dialog
  // ---------------------------------------------------------------------------

  test("Escape closes help overlay", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open help with ?
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Escape closes help
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)
  })

  test("Escape closes local find bar", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open local find with /
    board.command("local_find")
    expect(getActiveBoardPane(store.getState())!.localSearch).not.toBeNull()

    // Escape closes find bar
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.localSearch).toBeNull()
  })

  test("Escape closes new item dialog", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open new item dialog with Cmd+shift+Enter
    board.press("cmd+shift+Enter")
    expect(store.getState().ui.showNewItemDialog).toBe(true)

    // Escape closes dialog
    board.press("Escape")
    expect(store.getState().ui.showNewItemDialog).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Layer 4: Selection active → collapse to cursor
  // ---------------------------------------------------------------------------

  test("Escape collapses multi-selection to cursor", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    // Select multiple items with Shift+ArrowDown
    board.press("shift+ArrowDown")
    board.press("shift+ArrowDown")
    expect(store.getState().sel.node.ids().length).toBeGreaterThan(1)

    // Escape collapses multi-selection to single cursor
    board.press("Escape")
    expect(store.getState().sel.node.ids().length).toBeLessThanOrEqual(1)
  })

  test("Escape absorbs when only cursor is set (no bell)", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"))))
    board.expect("#task1[data-cursor]").toExist()

    // Escape with just a cursor: collapses (no-op on already-collapsed) and absorbs
    board.press("Escape")
    expect(board.bell).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Priority ordering: higher layers take precedence
  // ---------------------------------------------------------------------------

  test("Escape unfocuses detail pane before clearing selection", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Select items
    board.press("shift+ArrowDown")
    expect(store.getState().sel.node.ids().length).toBeGreaterThan(1)

    // D opens + auto-focuses detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape 1: unfocus detail → return to board (pane stays open)
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    // Selection is still there
    expect(store.getState().sel.node.ids().length).toBeGreaterThan(1)

    // Escape 2: close pane (selection still there)
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
    expect(store.getState().sel.node.ids().length).toBeGreaterThan(1)
  })

  // ---------------------------------------------------------------------------
  // Full stack walkthrough
  // ---------------------------------------------------------------------------

  test("multiple Escapes peel layers one at a time (dialog → collapse)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open help dialog (layer 3)
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Escape 1: close help
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)

    // Escape 2+: collapses selection (absorbs — no bell)
    board.press("Escape")
    expect(board.bell).toBe(false)
  })

  test("pane open + selection: Escape unfocuses pane, closes pane, then collapses selection", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Create selection
    board.press("shift+ArrowDown")
    expect(store.getState().sel.node.ids().length).toBeGreaterThan(1)

    // D opens + auto-focuses detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Escape 1: unfocus detail → return to board
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape 2: close pane (selection still active)
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
    expect(store.getState().sel.node.ids().length).toBeGreaterThan(1)

    // Escape 3: collapse multi-selection to cursor
    board.press("Escape")
    expect(store.getState().sel.node.ids().length).toBeLessThanOrEqual(1)
  })

  // ---------------------------------------------------------------------------
  // Double-Escape Bug Regression (km-tui.double-esc)
  //
  // When local find (/) results are visible but the find bar input is closed,
  // pressing Escape during inline editing would fire find_close instead of
  // text.exit_edit. Fix: find_close requires not(isInlineEditing).
  // ---------------------------------------------------------------------------

  test("single Escape exits inline edit mode to normal mode", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    app.press("Enter") // enter edit mode

    // Single Escape should exit edit mode
    app.press("Escape")

    // Verify we're back in normal mode by pressing j to navigate
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()
  })

  test("single Escape after typing saves and exits to normal mode", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    app.press("Enter")
    app.command("toggle_task_done")
    app.press("y")

    // Single Escape should save and exit
    app.press("Escape")

    // Content should be saved
    expect(app.repo.getNode("1a")?.content).toBe("1axy")

    // Should be in normal mode — j navigates
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()
  })

  test("Escape exits inline edit before closing local find (regression)", () => {
    // Regression: when localSearch state exists and user is in inline edit,
    // Escape should exit edit mode (text.exit_edit) before closing find results.
    // The fix was: find_close requires not(isInlineEditing).
    const { board, repo, store } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"))))

    // Set localSearch state directly (simulating confirmed find results visible)
    store.setState((s) => {
      const pane = getActiveBoardPane(s)
      if (pane) {
        pane.localSearch = {
          query: "a",
          isInputActive: false,
          matchIndex: 0,
          matchCount: 1,
          matchNodeIds: ["alpha"],
        }
      }
      return s
    })

    // Enter edit mode on the card
    board.press("Enter") // edit card "alpha"
    board.expectEditing("alpha")

    // Type something
    board.press("z")

    // Single Escape should exit edit mode (not close find results)
    board.press("Escape")
    board.expectNotEditing()

    // Content should be saved (alpha + z)
    expect(repo.getNode("alpha")?.content).toBe("alphaz")

    // Should be in normal mode — j navigates
    board.command("cursor_down")
    board.expect("#beta[data-cursor]").toExist()
  })
})

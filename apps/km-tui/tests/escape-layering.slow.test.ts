/**
 * Escape Layering Tests (km-all.kb-escape)
 *
 * Verifies the escape key pops one layer at a time from the focus stack:
 *
 * 0. Visual/move mode → exit mode
 * 1. Text edit mode → exit to node mode (save edit, cursor stays on node)
 * 2. Pane focused → unfocus pane, return focus to board (pane stays open)
 * 3. Dialog open → close topmost dialog
 * 4. Selection active → clear selection
 * 5. Nothing to do → no-op (visual bell)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/board-app-store.ts"

describe("Escape Layering", () => {
  // ---------------------------------------------------------------------------
  // Layer 0: Visual mode / Move mode
  // ---------------------------------------------------------------------------

  test("Escape exits visual mode", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // Enter visual mode with 'v v' chord + space to select
    board.command("visual_mode_enter").command("select_toggle")
    expect(getActiveBoardPane(store.getState())!.visualMode).toBe(true)

    // Escape exits visual mode
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.visualMode).toBe(false)
  })

  test("Escape cancels move mode", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // Enter move mode with 'mm'
    board.command("enter_move_mode")
    expect(getActiveBoardPane(store.getState())!.moveMode).toBe(true)

    // Escape cancels move mode
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.moveMode).toBe(false)
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

  test("Escape from detail pane: unfocus → close → bell", () => {
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

    // Escape 3: nothing left → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
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
  // Layer 4: Selection active → clear selection
  // ---------------------------------------------------------------------------

  test("Escape clears multi-selection", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    // Select multiple items with Shift+ArrowDown
    board.press("shift+ArrowDown")
    board.press("shift+ArrowDown")
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)

    // Escape clears selection
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Layer 5: Nothing to do → no-op (boundary/bell)
  // ---------------------------------------------------------------------------

  test("Escape with nothing active triggers boundary (bell)", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"))))
    board.expect("#task1[data-cursor]").toExist()

    // Escape with no dialogs, no pane, no selection → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Priority ordering: higher layers take precedence
  // ---------------------------------------------------------------------------

  test("Escape exits visual mode before clearing selection", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))
    board.expect("#1a[data-cursor]").toExist()

    // Enter visual mode (which also creates a selection)
    board.command("visual_mode_enter").command("select_toggle")
    expect(getActiveBoardPane(store.getState())!.visualMode).toBe(true)
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)

    // First Escape: exits visual mode (but selection may also be cleared since visual_mode_exit clears it)
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.visualMode).toBe(false)
  })

  test("Escape unfocuses detail pane before clearing selection", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Select items
    board.press("shift+ArrowDown")
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)

    // D opens + auto-focuses detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape 1: unfocus detail → return to board (pane stays open)
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    // Selection is still there
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)

    // Escape 2: close pane (selection still there)
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Full stack walkthrough
  // ---------------------------------------------------------------------------

  test("multiple Escapes peel layers one at a time (dialog → bell)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open help dialog (layer 3)
    board.command("show_help")
    expect(store.getState().ui.showHelp).toBe(true)

    // Escape 1: close help
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)

    // Escape 2: nothing left → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
  })

  test("pane open + selection: Escape unfocuses pane, closes pane, clears selection, then bells", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Create selection
    board.press("shift+ArrowDown")
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)

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
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBeGreaterThan(0)

    // Escape 3: clear selection
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.multiSelected.size).toBe(0)

    // Escape 3: nothing left → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Double-Escape Bug Regression (km-tui.double-esc)
  //
  // When local find (/) results are visible but the find bar input is closed,
  // pressing Escape during inline editing would fire find_close instead of
  // text.exit_edit. Fix: find_close requires not(isInlineEditing).
  // ---------------------------------------------------------------------------

  test("single Escape exits inline edit mode to normal mode", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter") // enter edit mode

    // Single Escape should exit edit mode
    board.press("Escape")

    // Verify we're back in normal mode by pressing j to navigate
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("single Escape after typing saves and exits to normal mode", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))

    board.press("Enter")
    board.command("toggle_task_done")
    board.press("y")

    // Single Escape should save and exit
    board.press("Escape")

    // Content should be saved
    expect(repo.getNode("1a")?.content).toBe("1axy")

    // Should be in normal mode — j navigates
    board.command("cursor_down")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Escape exits edit mode even with local find results visible (regression)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"))))

    // Do a local find (/) to set localSearch state
    board.command("local_find") // open find bar

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
    board.command("cursor_down")
    board.expect("#beta[data-cursor]").toExist()
  })
})

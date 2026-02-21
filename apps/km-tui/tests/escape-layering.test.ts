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

describe("Escape Layering", () => {
  // ---------------------------------------------------------------------------
  // Layer 0: Visual mode / Move mode
  // ---------------------------------------------------------------------------

  test("Escape exits visual mode", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // Enter visual mode with 'v'
    board.press("v")
    expect(store.getState().ui.visualMode).toBe(true)

    // Escape exits visual mode
    board.press("Escape")
    expect(store.getState().ui.visualMode).toBe(false)
  })

  test("Escape cancels move mode", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"))))
    board.expect("#1a[data-cursor]").toExist()

    // Enter move mode with 'mm'
    board.press("m").press("m")
    expect(store.getState().moveMode).toBe(true)

    // Escape cancels move mode
    board.press("Escape")
    expect(store.getState().moveMode).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Layer 1: Text edit → node mode
  // ---------------------------------------------------------------------------

  test("Escape exits inline edit mode (saves content, cursor stays on node)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.expect("#task1[data-cursor]").toExist()

    // Enter inline edit mode with 'i'
    board.press("i")
    expect(store.getState().ui.inlineEditBlock).not.toBeNull()
    expect(store.getState().ui.inlineEditBlock?.nodeId).toBe("task1")

    // Escape exits edit mode — cursor stays on same node
    board.press("Escape")
    expect(store.getState().ui.inlineEditBlock).toBeNull()
    board.expect("#task1[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Layer 2: Pane focused → unfocus pane (pane stays open)
  // ---------------------------------------------------------------------------

  test("Escape closes detail pane (focus stays on board)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // Open detail pane with D (focus stays on board)
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("board")

    // Escape closes pane
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(store.getState().ui.focusedPane).toBe("board")

    // Second Escape: nothing left → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Layer 3: Dialog open → close topmost dialog
  // ---------------------------------------------------------------------------

  test("Escape closes help overlay", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open help with ?
    board.press("?")
    expect(store.getState().ui.showHelp).toBe(true)

    // Escape closes help
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)
  })

  test("Escape closes local find bar", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open local find with /
    board.press("/")
    expect(store.getState().ui.localSearch).not.toBeNull()

    // Escape closes find bar
    board.press("Escape")
    expect(store.getState().ui.localSearch).toBeNull()
  })

  test("Escape closes new item dialog", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open new item dialog with gn chord
    board.press("g").press("n")
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
    board.press("Shift+ArrowDown")
    board.press("Shift+ArrowDown")
    expect(store.getState().ui.multiSelected.size).toBeGreaterThan(0)

    // Escape clears selection
    board.press("Escape")
    expect(store.getState().ui.multiSelected.size).toBe(0)
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
    board.press("v")
    expect(store.getState().ui.visualMode).toBe(true)
    expect(store.getState().ui.multiSelected.size).toBeGreaterThan(0)

    // First Escape: exits visual mode (but selection may also be cleared since visual_mode_exit clears it)
    board.press("Escape")
    expect(store.getState().ui.visualMode).toBe(false)
  })

  test("Escape closes detail pane before clearing selection", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Select items
    board.press("Shift+ArrowDown")
    expect(store.getState().ui.multiSelected.size).toBeGreaterThan(0)

    // Open detail pane (focus stays on board)
    board.press("D")
    expect(store.getState().ui.focusedPane).toBe("board")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Escape closes pane first (higher priority than clearing selection)
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)
    // Selection is still there
    expect(store.getState().ui.multiSelected.size).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Full stack walkthrough
  // ---------------------------------------------------------------------------

  test("multiple Escapes peel layers one at a time (dialog → bell)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))

    // Open help dialog (layer 3)
    board.press("?")
    expect(store.getState().ui.showHelp).toBe(true)

    // Escape 1: close help
    board.press("Escape")
    expect(store.getState().ui.showHelp).toBe(false)

    // Escape 2: nothing left → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
  })

  test("pane open + selection: Escape closes pane, clears selection, then bells", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )

    // Create selection
    board.press("Shift+ArrowDown")
    expect(store.getState().ui.multiSelected.size).toBeGreaterThan(0)

    // Open detail pane (focus stays on board)
    board.press("D")
    expect(store.getState().ui.focusedPane).toBe("board")

    // Escape 1: close pane (selection still active)
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(store.getState().ui.multiSelected.size).toBeGreaterThan(0)

    // Escape 2: clear selection
    board.press("Escape")
    expect(store.getState().ui.multiSelected.size).toBe(0)

    // Escape 3: nothing left → bell
    board.press("Escape")
    expect(board.bell).toBe(true)
  })
})

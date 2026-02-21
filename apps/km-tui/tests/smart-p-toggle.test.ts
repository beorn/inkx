/**
 * Detail pane toggle tests
 *
 * D toggles detail pane open/closed. Focus stays on board.
 * Detail pane follows cursor selection (read-only preview).
 * Pane focus (interactive mode) is future work.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Detail pane toggle", () => {
  test("D opens pane, D again closes it (focus stays on board)", () => {
    const { board, store, focusManager } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Initial: pane closed, board focused
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")

    // D opens pane, focus stays on board
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")

    // D again closes pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")
  })

  test("cursor movement works while detail pane is open", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // j moves cursor down on the board
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("card2")
    expect(store.getState().ui.showDetailPane).toBe(true)
    // Buffer must show cursor on card2 (not card1)
    board.expect("#card2[data-cursor]").toExist()
    board.expect("#card1[data-cursor]").not.toExist()

    // k moves cursor back up
    board.press("k")
    expect(store.getState().cursorNodeId).toBe("card1")
    expect(store.getState().ui.showDetailPane).toBe(true)
    // Buffer must show cursor on card1 (not card2)
    board.expect("#card1[data-cursor]").toExist()
    board.expect("#card2[data-cursor]").not.toExist()
  })

  test("cursor movement with detail pane - incremental rendering", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"), item("card3"))), {
      checkIncremental: true,
    })

    // Open pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.expect("#card1[data-cursor]").toExist()

    // j moves cursor down — incremental render must reflect change
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("card2")
    board.expect("#card2[data-cursor]").toExist()
    board.expect("#card1[data-cursor]").not.toExist()

    // k moves cursor back up
    board.press("k")
    expect(store.getState().cursorNodeId).toBe("card1")
    board.expect("#card1[data-cursor]").toExist()

    // l moves to a different column (if visible)
    board.press("j") // back to card2
    board.press("j") // to card3
    expect(store.getState().cursorNodeId).toBe("card3")
    board.expect("#card3[data-cursor]").toExist()
  })

  test("Escape closes detail pane", () => {
    const { board, store, focusManager } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")
  })

  test("scroll offset resets on each transition", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open pane
    board.press("D")
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    // Simulate scroll
    store.setState((s: any) => ({
      ...s,
      ui: { ...s.ui, detailScrollOffset: 6 },
    }))
    expect(store.getState().ui.detailScrollOffset).toBe(6)

    // Close pane with D → offset should reset
    board.press("D")
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    // Reopen → offset should be fresh
    board.press("D")
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("multiple D cycles work correctly", () => {
    const { board, store, focusManager } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Rapid toggle: open → close
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)

    // Again
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")
  })
})

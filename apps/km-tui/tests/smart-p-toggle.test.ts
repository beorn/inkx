/**
 * Detail pane toggle tests
 *
 * D toggles detail pane open/closed. D auto-focuses detail pane on open.
 * Detail pane follows cursor selection (read-only preview).
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Detail pane toggle", () => {
  test("D opens pane and auto-focuses detail, D again closes it", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Initial: pane closed
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // D opens pane and auto-focuses detail
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // D again closes pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("cursor movement works while detail pane is open", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open pane (auto-focuses detail), return to board
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.command("cursor_left") // return to board

    // j moves cursor down on the board
    board.command("cursor_down")
    board.expectState({ cursor: "card2" })
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    // Buffer must show cursor on card2 (not card1)
    board.expect("#card2[data-cursor]").toExist()
    board.expect("#card1[data-cursor]").not.toExist()

    // k moves cursor back up
    board.command("cursor_up")
    board.expectState({ cursor: "card1" })
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    // Buffer must show cursor on card1 (not card2)
    board.expect("#card1[data-cursor]").toExist()
    board.expect("#card2[data-cursor]").not.toExist()
  })

  test("cursor movement with detail pane - incremental rendering", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"), item("card3"))), {
      checkIncremental: true,
    })

    // Open pane (auto-focuses detail), return to board
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.command("cursor_left") // return to board
    board.expect("#card1[data-cursor]").toExist()

    // j moves cursor down — incremental render must reflect change
    board.command("cursor_down")
    board.expectState({ cursor: "card2" })
    board.expect("#card2[data-cursor]").toExist()
    board.expect("#card1[data-cursor]").not.toExist()

    // k moves cursor back up
    board.command("cursor_up")
    board.expectState({ cursor: "card1" })
    board.expect("#card1[data-cursor]").toExist()

    // l moves to a different column (if visible)
    board.command("cursor_down") // back to card2
    board.command("cursor_down") // to card3
    board.expectState({ cursor: "card3" })
    board.expect("#card3[data-cursor]").toExist()
  })

  test("Escape unfocuses then closes detail pane", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Escape 1: unfocus detail, return to board (pane stays open)
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape 2: close pane
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("detail cursor resets on each transition", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1", item("sub-a"), item("sub-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open pane — cursor starts on first child
    board.command("toggle_detail_pane")
    const getDetailCursor = () =>
      (store.getState().workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null
    expect(getDetailCursor()).toBe("sub-a")

    // Navigate within detail — cursor_down moves board cursor into sub-items.
    board.command("cursor_down")
    // After cursor_down, the detail pane cursor may have changed
    const afterCursorDown = getDetailCursor()
    // Just verify it's still a valid sub-item (not null)
    expect(afterCursorDown).toMatch(/^sub-/)

    // Close pane with D → pane removed
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Reopen → cursor should be fresh (first child)
    board.command("toggle_detail_pane")
    expect(getDetailCursor()).toBe("sub-a")
  })

  test("multiple D cycles work correctly", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Rapid toggle: open → close
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Again
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })
})

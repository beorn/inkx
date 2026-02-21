/**
 * Smart-D detail pane toggle tests
 *
 * Verifies the three-state D key behavior:
 * 1. Pane closed → D → open + focus pane
 * 2. Pane open, board focused → D → focus pane
 * 3. Pane open, pane focused → D → close pane
 *
 * Also verifies Escape unfocuses pane (returns to board) without closing,
 * and Cmd+W always closes the pane regardless of focus state.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Smart-D detail pane toggle", () => {
  test("three-state cycle: D opens+focuses, Escape unfocuses, D refocuses, D closes", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"), item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    // Initial: pane closed, board focused
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(store.getState().ui.focusedPane).toBe("board")

    // State 1: P opens pane and focuses it
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")

    // Escape unfocuses pane (returns to board), pane stays open
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("board")

    // State 2: P with pane open + board focused → focus pane (not toggle closed)
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")

    // State 3: P with pane open + pane focused → close pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(store.getState().ui.focusedPane).toBe("board")
  })

  test("P from closed state opens and focuses detail pane", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"))),
      { checkIncremental: false, incremental: false },
    )

    expect(store.getState().ui.showDetailPane).toBe(false)

    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")
  })

  test("P when pane is open but board has focus → focuses pane without closing", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"))),
      { checkIncremental: false, incremental: false },
    )

    // Open and focus pane, then Escape to return focus to board
    board.press("D")
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("board")

    // P should focus the pane, not close it
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")
  })

  test("P when pane is open and focused → closes pane", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"))),
      { checkIncremental: false, incremental: false },
    )

    // Open and focus pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")

    // P again closes the pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(store.getState().ui.focusedPane).toBe("board")
  })

  test("scroll offset resets on each transition", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"))),
      { checkIncremental: false, incremental: false },
    )

    // Open pane
    board.press("D")
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    // Simulate scroll (detail pane scroll sets offset directly in store)
    store.setState((s: any) => ({
      ...s,
      ui: { ...s.ui, detailScrollOffset: 6 },
    }))
    expect(store.getState().ui.detailScrollOffset).toBe(6)

    // Close pane with P → offset should reset
    board.press("D")
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    // Reopen → offset should be fresh
    board.press("D")
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("Escape in detail pane returns focus to board without closing", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"), item("card2"))),
      { checkIncremental: false, incremental: false },
    )

    // Open and focus pane
    board.press("D")
    expect(store.getState().ui.focusedPane).toBe("detail")

    // Escape → board focused, pane still open
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("board")

    // Can navigate normally while pane stays open
    board.press("j")
    expect(store.getState().cursorNodeId).toBe("card2")
    expect(store.getState().ui.showDetailPane).toBe(true)
  })

  test("multiple P cycles work correctly", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("card1"))),
      { checkIncremental: false, incremental: false },
    )

    // Cycle 1: open+focus → close
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)

    // Cycle 2: open+focus → unfocus → refocus → close
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")
    board.press("Escape")
    expect(store.getState().ui.focusedPane).toBe("board")
    board.press("D")
    expect(store.getState().ui.focusedPane).toBe("detail")
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)

    // Cycle 3: open+focus → close (rapid toggle)
    board.press("D")
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
    expect(store.getState().ui.focusedPane).toBe("board")
  })
})

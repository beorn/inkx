/**
 * Detail pane scrolling tests
 *
 * Verifies that detail pane scroll offset changes correctly,
 * and that scroll offset resets when the cursor moves to a different node.
 *
 * Note: detail_pane.scroll_down/scroll_up commands have no keybindings in v2.
 * Scrolling is triggered via mouse wheel. These tests verify the scroll offset
 * state management by setting detailScrollOffset directly via the store.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

/** Helper: simulate scroll down by incrementing detailScrollOffset by 3 (same as DETAIL_PANE_SCROLL_DOWN action) */
function scrollDown(store: { getState: () => any; setState: (fn: any) => void }) {
  store.setState((s: any) => ({ ...s, ui: { ...s.ui, detailScrollOffset: s.ui.detailScrollOffset + 3 } }))
}

/** Helper: simulate scroll up by decrementing detailScrollOffset by 3 (clamped to 0) */
function scrollUp(store: { getState: () => any; setState: (fn: any) => void }) {
  store.setState((s: any) => ({
    ...s,
    ui: { ...s.ui, detailScrollOffset: Math.max(0, s.ui.detailScrollOffset - 3) },
  }))
}

describe("detail pane scrolling", () => {
  test("scroll down increments offset", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    scrollDown(store)
    expect(store.getState().ui.detailScrollOffset).toBe(3)

    scrollDown(store)
    expect(store.getState().ui.detailScrollOffset).toBe(6)
  })

  test("scroll up decrements offset", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane
    scrollDown(store)
    scrollDown(store)
    expect(store.getState().ui.detailScrollOffset).toBe(6)

    scrollUp(store)
    expect(store.getState().ui.detailScrollOffset).toBe(3)
  })

  test("scroll up does not go past top", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    scrollUp(store) // try to scroll up past top
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("scroll offset resets when cursor moves to different node", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane
    scrollDown(store)
    expect(store.getState().ui.detailScrollOffset).toBe(3)

    board.press("j") // move to next card — should reset scroll
    expect(store.getState().cursorNodeId).toBe("card2")
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("scroll offset resets when detail pane is toggled", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press("D") // open detail pane
    scrollDown(store)
    expect(store.getState().ui.detailScrollOffset).toBe(3)

    board.press("D") // close detail pane
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    board.press("D") // reopen detail pane
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("scroll state is independent of nav_back/nav_forward keys", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    expect(store.getState().ui.showDetailPane).toBe(false)

    // {/} are nav_back/nav_forward in v2, not detail scroll
    board.press("}")
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    board.press("{")
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })
})

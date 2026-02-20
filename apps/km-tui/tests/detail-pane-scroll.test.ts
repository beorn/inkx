/**
 * Detail pane scrolling tests
 *
 * Verifies that {/} keys scroll the detail pane content when it's open,
 * and that scroll offset resets when the cursor moves to a different node.
 */
import { test, expect, describe } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("detail pane scrolling", () => {
  test("} scrolls detail pane down", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press(" ") // open detail pane
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    board.press("}") // scroll down
    expect(store.getState().ui.detailScrollOffset).toBe(3)

    board.press("}") // scroll down again
    expect(store.getState().ui.detailScrollOffset).toBe(6)
  })

  test("{ scrolls detail pane up", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press(" ") // open detail pane
    board.press("}") // scroll down
    board.press("}") // scroll down more
    expect(store.getState().ui.detailScrollOffset).toBe(6)

    board.press("{") // scroll up
    expect(store.getState().ui.detailScrollOffset).toBe(3)
  })

  test("{ does not scroll past top", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press(" ") // open detail pane
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    board.press("{") // try to scroll up past top
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("scroll offset resets when cursor moves to different node", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    board.press(" ") // open detail pane
    board.press("}") // scroll down
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

    board.press(" ") // open detail pane
    board.press("}") // scroll down
    expect(store.getState().ui.detailScrollOffset).toBe(3)

    board.press(" ") // close detail pane
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    board.press(" ") // reopen detail pane
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })

  test("{/} do nothing when detail pane is closed", { timeout: 5000 }, () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    expect(store.getState().ui.showDetailPane).toBe(false)

    board.press("}") // should not scroll (detail pane closed)
    expect(store.getState().ui.detailScrollOffset).toBe(0)

    board.press("{") // should not scroll (detail pane closed)
    expect(store.getState().ui.detailScrollOffset).toBe(0)
  })
})

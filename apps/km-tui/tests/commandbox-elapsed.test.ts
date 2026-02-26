/**
 * StatusCounters elapsed time display — verifies that the loading spinner
 * and elapsed seconds counter render correctly in the bottom bar.
 *
 * The StatusCounters shows:
 * - A spinner frame when isLoading is true
 * - Elapsed seconds (e.g. "2s") when loadingStartTime is set and elapsed > 1s
 * - No elapsed text when elapsed <= 1s (just the spinner)
 */

import { describe, test, expect } from "vitest"
import { act } from "react"
import { item, testEnv } from "/Users/beorn/Code/pim/km/apps/km-tui/tests/helpers/board-test.ts"

// Spinner frame 0 (tests skip the interval, so frame stays at index 0)
const SPINNER_FRAME_0 = "\u280B"

/** Set loading state and flush the render pipeline without triggering command handling */
function setLoadingState(
  board: ReturnType<typeof testEnv>["board"],
  store: ReturnType<typeof testEnv>["store"],
  opts: { isLoading: boolean; loadingStartTime: number | null },
) {
  act(() => {
    store.setState((s) => ({
      ...s,
      ui: { ...s.ui, isLoading: opts.isLoading, loadingStartTime: opts.loadingStartTime },
    }))
  })
  // Flush React render pipeline without routing through handleKey
  // (avoids "Unmapped key" toast that board.press("F20") would trigger)
  void board._result.press("")
}

describe("StatusCounters elapsed time display", () => {
  test("loading spinner shows when isLoading is true", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Before loading: no spinner frame in the bottom bar
    const before = board.screenshot()
    expect(before).not.toContain(SPINNER_FRAME_0)

    // Set loading state
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() })

    const after = board.screenshot()
    expect(after).toContain(SPINNER_FRAME_0)
  })

  test("elapsed time shows after 1 second", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Set loading with a start time 2 seconds in the past
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() - 2000 })

    const text = board.screenshot()
    // Should show "2s" (elapsed > 1 triggers the display)
    expect(text).toContain("2s")
    // Spinner should also be present
    expect(text).toContain(SPINNER_FRAME_0)
  })

  test("elapsed time does NOT show when elapsed <= 1 second", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Set loading with a start time just now (0 seconds elapsed)
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() })

    const text = board.screenshot()
    // Spinner should appear
    expect(text).toContain(SPINNER_FRAME_0)
    // But no "0s" or "1s" text — elapsed <= 1 shows just the spinner
    expect(text).not.toMatch(/\d+s/)
  })

  test("elapsed time clears when loading stops", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Start loading 3 seconds ago
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() - 3000 })
    expect(board.screenshot()).toContain("3s")

    // Stop loading
    setLoadingState(board, store, { isLoading: false, loadingStartTime: null })

    const text = board.screenshot()
    // Spinner and elapsed should both be gone
    expect(text).not.toContain(SPINNER_FRAME_0)
    expect(text).not.toMatch(/\d+s/)
  })

  test("elapsed time shows larger values for longer operations", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("Task Alpha"))))

    // Simulate 15 seconds of loading
    setLoadingState(board, store, { isLoading: true, loadingStartTime: Date.now() - 15000 })

    const text = board.screenshot()
    expect(text).toContain("15s")
  })
})

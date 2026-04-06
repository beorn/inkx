/**
 * Cursor Visibility Regression Tests
 *
 * Ensures cursor NEVER lands on hidden/invalid nodes through all "shades" of hidden:
 * - .km/hidden file (excluded from ViewSnapshot at tree build time)
 * - Folded children (excluded by foldDepths in buildViewTree)
 * - After zoom (sel.root synced to new rootId)
 * - Mixed navigation sequences (j/k/h/l, fold, zoom)
 *
 * Root causes found (signals migration, 2026-04-05):
 * 1. clearSelection() called sel.deselect() — clears cursor. Fixed: sel.node.collapse()
 * 2. handleCursorMove cleared selection at size>0 — always true. Fixed: size>1
 * 3. sel.root not synced after zoom — empty walkOrder. Fixed: syncPaneSignals sets root
 *
 * These are permanent regression tests, not ad-hoc exploration.
 * Runtime invariants (checkInvariants) catch this at every keypress too.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** Assert cursor is non-null and return it. */
function expectCursor(store: { getState: () => any }): string {
  const cursor = store.getState().sel.node.cursor() as string | null
  expect(cursor, "cursor must not be null").not.toBeNull()
  return cursor!
}

// =============================================================================
// Navigation: cursor persists through all movement commands
// =============================================================================

describe("cursor persistence through navigation", () => {
  test("j/k vertical navigation", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
      incremental: false,
    })
    for (const key of ["j", "j", "j", "k", "k"]) {
      board.press(key)
      expectCursor(store)
    }
  })

  test("h/l horizontal navigation", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
      { incremental: false },
    )
    for (const key of ["l", "l", "h", "h"]) {
      board.press(key)
      expectCursor(store)
    }
  })

  test("mixed j/k/h/l across 3 columns", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a")),
        ),
      { incremental: false },
    )
    for (const key of ["j", "j", "l", "j", "l", "k", "h", "h", "k", "k", "j", "j", "j"]) {
      board.press(key)
      expectCursor(store)
    }
  })

  test("boundary navigation (press past edges)", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })
    // Try to go past boundaries — cursor must never null
    for (const key of ["j", "j", "j", "j", "k", "k", "k", "k", "h", "h", "l", "l"]) {
      board.press(key)
      expectCursor(store)
    }
  })
})

// =============================================================================
// Fold/unfold: cursor stays on visible nodes
// =============================================================================

describe("cursor persistence through fold/unfold", () => {
  test("fold hides children — cursor stays visible", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("1a", item("sub1"), item("sub2")), item("1b"))),
      { incremental: false },
    )
    board.press("j") // col1
    board.press("j") // 1a
    board.press("H") // fold 1a
    const c = expectCursor(store)
    expect(c).not.toBe("sub1")
    expect(c).not.toBe("sub2")
  })

  test("fold then navigate — cursor valid", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("1a", item("sub1")), item("1b"))), {
      incremental: false,
    })
    board.press("j") // col1
    board.press("j") // 1a
    board.press("H") // fold
    board.press("j") // navigate after fold
    expectCursor(store)
    board.press("k")
    expectCursor(store)
  })
})

// =============================================================================
// Zoom: cursor valid through zoom in/out
// =============================================================================

describe("cursor persistence through zoom", () => {
  test("zoom in + navigate", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
      incremental: false,
    })
    board.press("j") // col1
    board.command("zoom_inwards")
    for (const key of ["j", "j", "k"]) {
      board.press(key)
      expectCursor(store)
    }
  })

  test("zoom in then out", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))), {
      incremental: false,
    })
    board.press("j") // col1
    board.command("zoom_inwards")
    board.press("j") // navigate inside
    expectCursor(store)
    board.command("zoom_outwards")
    expectCursor(store)
  })
})

// =============================================================================
// Hidden nodes: cursor skips them
// =============================================================================

describe("cursor skips hidden nodes", () => {
  test("hidden column skipped during h/l navigation", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("1a")), item("col2-hidden", item("2a")), item("col3", item("3a"))),
      { incremental: false },
    )
    const pane = store.getState().workspace.panes.get("main") as any
    if (pane?.signals) pane.signals.hiddenNodeIds(new Set(["col2-hidden"]))
    board.press("l")
    const c = expectCursor(store)
    expect(c).not.toBe("col2-hidden")
    expect(c).not.toBe("2a")
  })
})

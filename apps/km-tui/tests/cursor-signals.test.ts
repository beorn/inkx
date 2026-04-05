/**
 * Cursor validity after signals migration.
 *
 * Reproduces the "no cursor" bug: after the signals migration, cursoring
 * around the TUI causes cursor to disappear during normal navigation.
 *
 * Root causes found:
 * 1. clearSelection() called sel.deselect() which clears cursor — should collapse()
 * 2. handleCursorMove cleared selection even for single cursor (size > 0 instead of > 1)
 * 3. Board root not in walkOrder — sel.node.select(rootId) normalized to [] → deselect
 *
 * Tests cursor persistence through:
 * - Basic j/k/h/l navigation
 * - Fold/unfold (z/H/L)
 * - Zoom in/out (Z/Enter on column)
 * - Block navigation (J/K)
 * - Rapid mixed navigation sequences
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

/** Get the current cursor from the store. */
function getCursor(store: { getState: () => any }): string | null {
  const s = store.getState()
  const pane = getActiveBoardPane(s)
  return pane ? (pane.sel.node.cursor() as string | null) : null
}

/** Assert cursor is not null. */
function expectCursor(store: { getState: () => any }, msg?: string): string {
  const cursor = getCursor(store)
  expect(cursor, msg ?? "cursor must not be null").not.toBeNull()
  return cursor!
}

// =============================================================================
// Basic navigation: cursor must persist through j/k/h/l
// =============================================================================

describe("cursor persistence through navigation", () => {
  test("j/k navigation never loses cursor", () => {
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b"), item("2c")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
    )

    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    // 3rd j — boundary at last card; cursor must stay
    board.press("j")
    expectCursor(store)

    board.press("k")
    expectCursor(store)

    board.press("k")
    expectCursor(store)
  })

  test("h/l navigation never loses cursor", () => {
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a"), item("3b")),
      ),
    )

    board.press("j").press("j")
    expectCursor(store)

    board.press("l")
    expectCursor(store)

    board.press("l")
    expectCursor(store)

    board.press("h")
    expectCursor(store)

    board.press("h")
    expectCursor(store)
  })

  test("mixed j/k/h/l navigation sequence", () => {
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b"), item("2c")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
    )

    board.press("j").press("j")
    expectCursor(store)

    board.press("l")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("l")
    expectCursor(store)

    board.press("k")
    expectCursor(store)

    board.press("h")
    expectCursor(store)

    board.press("h")
    expectCursor(store)

    // Move up to column level and then to board root
    board.press("k").press("k").press("k")
    expectCursor(store)
  })
})

// =============================================================================
// Fold/unfold: cursor must persist through z operations
// =============================================================================

describe("cursor persistence through fold/unfold", () => {
  test("fold_node (H) then navigate preserves cursor", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling"))),
    )

    board.press("j").press("j")
    expectCursor(store)

    board.command("fold_node")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("k")
    expectCursor(store)
  })

  test("unfold_node (L) then navigate preserves cursor", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling"))),
    )

    board.press("j").press("j")
    board.command("fold_node")
    expectCursor(store)

    board.command("unfold_node")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("j")
    expectCursor(store)
  })

  test("fold_all / unfold_all preserves cursor", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("A", item("a1"), item("a2")), item.folder("B", item("b1")))),
    )

    board.press("j").press("j")
    expectCursor(store)

    board.command("fold_all")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.command("unfold_all")
    expectCursor(store)

    board.press("j")
    expectCursor(store)
  })
})

// =============================================================================
// Zoom: cursor must persist through Z/Enter
// =============================================================================

describe("cursor persistence through zoom", () => {
  test("zoom in (z) then navigate preserves cursor", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2"))), item("col2", item("other"))),
    )

    board.press("j").press("j")
    expectCursor(store)

    board.command("zoom_inwards")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.command("zoom_outwards")
    expectCursor(store)
  })

  test("zoom to column then navigate preserves cursor", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"))),
    )

    board.press("j")
    expectCursor(store)

    board.command("zoom_inwards")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("j")
    expectCursor(store)

    board.press("k")
    expectCursor(store)
  })
})

// =============================================================================
// Block navigation: J/K (spatial) must preserve cursor
// =============================================================================

describe("cursor persistence through block navigation", () => {
  test("J/K spatial navigation never loses cursor", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item.folder("Parent", item("child-1"), item("child-2")), item("sibling"))),
    )

    board.press("j").press("j")
    expectCursor(store)

    board.press("J")
    expectCursor(store)

    board.press("J")
    expectCursor(store)

    board.press("K")
    expectCursor(store)

    board.press("K")
    expectCursor(store)
  })
})

// =============================================================================
// Rapid navigation: cursor must survive many rapid operations
// =============================================================================

describe("cursor persistence through rapid operations", () => {
  test("20 rapid j/k/h/l presses never lose cursor", () => {
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c")),
        item("col2", item("2a"), item("2b"), item("2c")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
    )

    const keys = ["j", "j", "l", "j", "l", "k", "h", "j", "j", "l", "k", "k", "h", "j", "l", "l", "k", "h", "h", "k"]
    for (const key of keys) {
      board.press(key)
      const cursor = getCursor(store)
      expect(cursor, `cursor must not be null after pressing "${key}"`).not.toBeNull()
    }
  })
})

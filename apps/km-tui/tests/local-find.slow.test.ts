/**
 * Local Find (Inline Search Bar) Tests
 *
 * Tests for the inline find bar triggered by `/` or `Ctrl+f`.
 * Verifies: open/close, typing, match counting, n/N navigation,
 * Enter confirms, Escape closes, and cursor moves to matches.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

describe("Local Find", () => {
  // ---------------------------------------------------------------------------
  // Opening and Closing
  // ---------------------------------------------------------------------------

  test("/ opens the find bar", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.command("local_find")
    expect(getActiveBoardPane(store.getState())!.localSearch).not.toBeNull()
    expect(getActiveBoardPane(store.getState())!.localSearch?.isInputActive).toBe(true)
    board.expect("#find-bar").toExist()
  })

  test("Cmd+f opens the find bar", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.press("cmd+f")
    expect(getActiveBoardPane(store.getState())!.localSearch).not.toBeNull()
    expect(getActiveBoardPane(store.getState())!.localSearch?.isInputActive).toBe(true)
    board.expect("#find-bar").toExist()
  })

  test("Escape closes the find bar", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.command("local_find")
    expect(getActiveBoardPane(store.getState())!.localSearch).not.toBeNull()
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.localSearch).toBeNull()
  })

  test("find bar disappears from screen after Escape", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.command("local_find")
    board.expect("#find-bar").toExist()
    board.press("Escape")
    board.expect("#find-bar").not.toExist()
  })

  // ---------------------------------------------------------------------------
  // Typing and Match Counting
  // ---------------------------------------------------------------------------

  test("typing a query updates match count", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("box"), item("dog"))))
    board.command("local_find")
    // Type "ox" — should match "fox" and "box"
    board.command("insert_below")
    board.command("toggle_task_done")
    const ls = getActiveBoardPane(store.getState())!.localSearch
    expect(ls).not.toBeNull()
    expect(ls!.query).toBe("ox")
    expect(ls!.matchCount).toBe(2)
    expect(ls!.matchNodeIds).toContain("fox")
    expect(ls!.matchNodeIds).toContain("box")
  })

  test("match count displays on screen", () => {
    const { board } = testEnv(() => item("board", item("col", item("fox"), item("box"), item("dog"))))
    board.command("local_find")
    // Type "ox" — matches fox, box
    board.command("insert_below")
    board.command("toggle_task_done")
    const output = board.screenshot()
    expect(output).toContain("1 of 2")
  })

  test("no matches shows 'No matches' indicator", () => {
    const { board } = testEnv(() => item("board", item("col", item("alpha"), item("beta"))))
    board.command("local_find")
    board.command("zoom_inwards")
    board.command("zoom_inwards")
    board.command("zoom_inwards")
    const output = board.screenshot()
    expect(output).toContain("No matches")
  })

  test("search is case-insensitive", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("Alpha"), item("BETA"))))
    board.command("local_find")
    // Type "alp" to match only "Alpha"
    board.press("a")
    board.command("cursor_right")
    board.press("p")
    const ls = getActiveBoardPane(store.getState())!.localSearch
    expect(ls).not.toBeNull()
    expect(ls!.matchCount).toBe(1)
    expect(ls!.matchNodeIds).toContain("Alpha")
  })

  // ---------------------------------------------------------------------------
  // Cursor Navigation to Matches
  // ---------------------------------------------------------------------------

  test("typing moves cursor to first match", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("apple"), item("banana")), item("col2", item("cherry"), item("apricot"))),
      { columns: 120 },
    )
    // Cursor starts on "apple" (first card, first column)
    board.expectState({ cursor: "apple" })

    board.command("local_find")
    // Type "ban" — should match only "banana"
    board.press("b")
    board.press("a")
    board.press("n")

    const ls = getActiveBoardPane(store.getState())!.localSearch
    expect(ls).not.toBeNull()
    expect(ls!.matchCount).toBe(1)
    expect(ls!.matchNodeIds).toContain("banana")
    // Cursor should move to banana
    board.expectState({ cursor: "banana" })
  })

  // ---------------------------------------------------------------------------
  // n/N Navigation Between Matches
  // ---------------------------------------------------------------------------

  test("Enter confirms and exits input mode", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"), item("box"))))
    board.command("local_find")
    // "ox" matches fox and box
    board.command("insert_below")
    board.command("toggle_task_done")
    expect(getActiveBoardPane(store.getState())!.localSearch?.isInputActive).toBe(true)

    board.press("Enter")
    const ls = getActiveBoardPane(store.getState())!.localSearch
    expect(ls).not.toBeNull()
    expect(ls!.isInputActive).toBe(false)
    // Matches should still be stored
    expect(ls!.matchCount).toBe(2)
  })

  test("n navigates to next match after Enter", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"), item("box"))))
    board.command("local_find")
    // "ox" matches fox (index 0) and box (index 1)
    board.command("insert_below")
    board.command("toggle_task_done")
    board.press("Enter")

    // Should be on first match (fox) — matchIndex 0
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchIndex).toBe(0)

    // Press n for next
    board.press("n")
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchIndex).toBe(1)
    board.expectState({ cursor: "box" })
  })

  test("N navigates to previous match after Enter", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"), item("box"))))
    board.command("local_find")
    // "ox" matches fox (index 0) and box (index 1)
    board.command("insert_below")
    board.command("toggle_task_done")
    board.press("Enter")

    // Press N for previous — wraps around to last match
    board.press("N")
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchIndex).toBe(1)
    board.expectState({ cursor: "box" })
  })

  test("n wraps around from last to first match", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"), item("box"))))
    board.command("local_find")
    // "ox" matches fox and box (2 matches)
    board.command("insert_below")
    board.command("toggle_task_done")
    board.press("Enter")

    // Navigate to last match
    board.press("n") // index 1 (box)
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchIndex).toBe(1)

    // n should wrap to first
    board.press("n") // index 0 (fox)
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchIndex).toBe(0)
    board.expectState({ cursor: "fox" })
  })

  test("Escape after Enter closes find bar entirely", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"))))
    board.command("local_find")
    board.command("insert_below")
    board.command("toggle_task_done")
    board.press("Enter")
    expect(getActiveBoardPane(store.getState())!.localSearch).not.toBeNull()

    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.localSearch).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Match indicator updates
  // ---------------------------------------------------------------------------

  test("match indicator updates as query changes", () => {
    const { board } = testEnv(() => item("board", item("col", item("fox"), item("foxy"), item("dog"))))
    board.command("local_find")
    // "fox" matches fox and foxy
    board.press("f")
    board.command("insert_below")
    board.command("toggle_task_done")
    expect(board.screenshot()).toContain("1 of 2")

    // Add "y" to narrow to only "foxy"
    board.press("y")
    expect(board.screenshot()).toContain("1 of 1")
  })

  test("clearing query resets match count", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"))))
    board.command("local_find")
    // "fox" matches only "fox"
    board.press("f")
    board.command("insert_below")
    board.command("toggle_task_done")
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchCount).toBe(1)

    // Backspace 3 times to clear
    board.press("Backspace")
    board.press("Backspace")
    board.press("Backspace")
    expect(getActiveBoardPane(store.getState())!.localSearch?.matchCount).toBe(0)
    expect(getActiveBoardPane(store.getState())!.localSearch?.query).toBe("")
  })

  // ---------------------------------------------------------------------------
  // Deep projection coverage (regression: km-tui.search-misses-cards)
  // ---------------------------------------------------------------------------

  test("finds sub-items nested below cards (3+ levels deep)", () => {
    // Bug: findMatchingNodeIds only walked 2 levels (root → col → card),
    // missing sub-items projected as "subitem" view type under cards.
    // Fix: walk the full visible projection via tree.walkOrder.
    const { board, store } = testEnv(
      () => item("board", item("col", item("parent-card", item("deeply-nested-subitem"), item("another-subitem")))),
      { columns: 120 },
    )
    board.command("local_find")
    // Type "nested" — should match "deeply-nested-subitem"
    board.press("n")
    board.press("e")
    board.press("s")
    board.press("t")
    board.press("e")
    board.press("d")

    const ls = getActiveBoardPane(store.getState())!.localSearch
    expect(ls).not.toBeNull()
    expect(ls!.matchCount).toBe(1)
    expect(ls!.matchNodeIds).toContain("deeply-nested-subitem")
  })

  test("finds parent cards AND their sub-items for a matching query", () => {
    // Both a card title and its sub-items should be searchable.
    const { board, store } = testEnv(
      () => item("board", item("todo", item("buy milk", item("buy eggs"), item("buy bread")), item("walk dog"))),
      { columns: 120 },
    )
    board.command("local_find")
    // "buy" matches: buy milk, buy eggs, buy bread
    board.press("b")
    board.press("u")
    board.press("y")

    const ls = getActiveBoardPane(store.getState())!.localSearch
    expect(ls).not.toBeNull()
    expect(ls!.matchCount).toBe(3)
    expect(ls!.matchNodeIds).toContain("buy milk")
    expect(ls!.matchNodeIds).toContain("buy eggs")
    expect(ls!.matchNodeIds).toContain("buy bread")
  })
})

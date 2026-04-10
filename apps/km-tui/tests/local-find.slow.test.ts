/**
 * Local Find (Inline Search Bar) Tests
 *
 * Tests for the inline find bar triggered by `/` or `Ctrl+f`.
 * Verifies: open/close, typing, match counting, n/N navigation,
 * Enter confirms, Escape closes, and cursor moves to matches.
 */

import { describe, test, expect } from "vitest"
import { act } from "react"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// NOTE: The "Enter before debounce" test below uses testEnv because it needs
// white-box store.setUI() manipulation to simulate the debounce race condition.

describe("Local Find", () => {
  // ---------------------------------------------------------------------------
  // Opening and Closing
  // ---------------------------------------------------------------------------

  test("/ opens the find bar", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    app.command("local_find")
    app.expect("#find-bar").toExist()
    app.expect("#find-bar[data-input-active]").toExist()
  })

  test("Cmd+f opens the find bar", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    app.press("cmd+f")
    app.expect("#find-bar").toExist()
    app.expect("#find-bar[data-input-active]").toExist()
  })

  test("Escape closes the find bar", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    app.command("local_find")
    app.expect("#find-bar").toExist()
    app.press("Escape")
    app.expect("#find-bar").not.toExist()
  })

  test("find bar disappears from screen after Escape", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    app.command("local_find")
    app.expect("#find-bar").toExist()
    app.press("Escape")
    app.expect("#find-bar").not.toExist()
  })

  // ---------------------------------------------------------------------------
  // Typing and Match Counting
  // ---------------------------------------------------------------------------

  test("typing a query updates match count", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("box"), item("dog"))))
    app.command("local_find")
    // Type "ox" — should match "fox" and "box"
    app.command("insert_below")
    app.command("toggle_task_done")
    app.expect("#find-bar[data-query='ox']").toExist()
    app.expect("#find-bar[data-match-count='2']").toExist()
    // Screen indicator shows "1 of 2"
    expect(app.text).toContain("1 of 2")
  })

  test("match count displays on screen", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("box"), item("dog"))))
    app.command("local_find")
    // Type "ox" — matches fox, box
    app.command("insert_below")
    app.command("toggle_task_done")
    expect(app.text).toContain("1 of 2")
  })

  test("no matches shows 'No matches' indicator", () => {
    using app = createTestApp(item("board", item("col", item("alpha"), item("beta"))))
    app.command("local_find")
    app.command("zoom_inwards")
    app.command("zoom_inwards")
    app.command("zoom_inwards")
    expect(app.text).toContain("No matches")
  })

  test("search is case-insensitive", () => {
    using app = createTestApp(item("board", item("col", item("Alpha"), item("BETA"))))
    app.command("local_find")
    // Type "alp" to match only "Alpha"
    app.press("a")
    app.command("cursor_right")
    app.press("p")
    app.expect("#find-bar[data-match-count='1']").toExist()
    // The matched card should have cursor on it (first match auto-selected)
    app.expect("#Alpha[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Cursor Navigation to Matches
  // ---------------------------------------------------------------------------

  test("typing moves cursor to first match", () => {
    using app = createTestApp(
      item("board", item("col1", item("apple"), item("banana")), item("col2", item("cherry"), item("apricot"))),
      { cols: 120 },
    )
    // Cursor starts on "apple" (first card, first column)
    app.expect("#apple[data-cursor]").toExist()

    app.command("local_find")
    // Type "ban" — should match only "banana"
    app.press("b")
    app.press("a")
    app.press("n")

    app.expect("#find-bar[data-match-count='1']").toExist()
    app.expect("#find-bar[data-query='ban']").toExist()
    // Cursor should move to banana
    app.expect("#banana[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // n/N Navigation Between Matches
  // ---------------------------------------------------------------------------

  test("Enter confirms and exits input mode", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("dog"), item("box"))))
    app.command("local_find")
    // "ox" matches fox and box
    app.command("insert_below")
    app.command("toggle_task_done")
    app.expect("#find-bar[data-input-active]").toExist()

    app.press("Enter")
    app.expect("#find-bar").toExist()
    app.expect("#find-bar[data-input-active]").not.toExist()
    // Matches should still be stored
    app.expect("#find-bar[data-match-count='2']").toExist()
  })

  test("n navigates to next match after Enter", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("dog"), item("box"))))
    app.command("local_find")
    // "ox" matches fox (index 0) and box (index 1)
    app.command("insert_below")
    app.command("toggle_task_done")
    app.press("Enter")

    // Should be on first match (fox) — matchIndex 0
    app.expect("#find-bar[data-match-index='0']").toExist()

    // Press n for next
    app.press("n")
    app.expect("#find-bar[data-match-index='1']").toExist()
    app.expect("#box[data-cursor]").toExist()
  })

  test("N navigates to previous match after Enter", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("dog"), item("box"))))
    app.command("local_find")
    // "ox" matches fox (index 0) and box (index 1)
    app.command("insert_below")
    app.command("toggle_task_done")
    app.press("Enter")

    // Press N for previous — wraps around to last match
    app.press("N")
    app.expect("#find-bar[data-match-index='1']").toExist()
    app.expect("#box[data-cursor]").toExist()
  })

  test("n wraps around from last to first match", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("dog"), item("box"))))
    app.command("local_find")
    // "ox" matches fox and box (2 matches)
    app.command("insert_below")
    app.command("toggle_task_done")
    app.press("Enter")

    // Navigate to last match
    app.press("n") // index 1 (box)
    app.expect("#find-bar[data-match-index='1']").toExist()

    // n should wrap to first
    app.press("n") // index 0 (fox)
    app.expect("#find-bar[data-match-index='0']").toExist()
    app.expect("#fox[data-cursor]").toExist()
  })

  test("Escape after Enter closes find bar entirely", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("dog"))))
    app.command("local_find")
    app.command("insert_below")
    app.command("toggle_task_done")
    app.press("Enter")
    app.expect("#find-bar").toExist()

    app.press("Escape")
    app.expect("#find-bar").not.toExist()
  })

  // ---------------------------------------------------------------------------
  // Match indicator updates
  // ---------------------------------------------------------------------------

  test("match indicator updates as query changes", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("foxy"), item("dog"))))
    app.command("local_find")
    // "fox" matches fox and foxy
    app.press("f")
    app.command("insert_below")
    app.command("toggle_task_done")
    expect(app.text).toContain("1 of 2")

    // Add "y" to narrow to only "foxy"
    app.press("y")
    expect(app.text).toContain("1 of 1")
  })

  test("clearing query resets match count", () => {
    using app = createTestApp(item("board", item("col", item("fox"), item("dog"))))
    app.command("local_find")
    // "fox" matches only "fox"
    app.press("f")
    app.command("insert_below")
    app.command("toggle_task_done")
    app.expect("#find-bar[data-match-count='1']").toExist()

    // Backspace 3 times to clear
    app.press("Backspace")
    app.press("Backspace")
    app.press("Backspace")
    app.expect("#find-bar[data-match-count='0']").toExist()
    app.expect("#find-bar[data-query='']").toExist()
  })

  // ---------------------------------------------------------------------------
  // Deep projection coverage (regression: km-tui.search-misses-cards)
  // ---------------------------------------------------------------------------

  test("finds sub-items nested below cards (3+ levels deep)", () => {
    // Bug: findMatchingNodeIds only walked 2 levels (root → col → card),
    // missing sub-items projected as "subitem" view type under cards.
    // Fix: walk the full visible projection via tree.walkOrder.
    using app = createTestApp(
      item("board", item("col", item("parent-card", item("deeply-nested-subitem"), item("another-subitem")))),
      { cols: 120 },
    )
    app.command("local_find")
    // Type "nested" — should match "deeply-nested-subitem"
    app.press("n")
    app.press("e")
    app.press("s")
    app.press("t")
    app.press("e")
    app.press("d")

    app.expect("#find-bar[data-match-count='1']").toExist()
    app.expect("#find-bar[data-query='nested']").toExist()
    // Cursor should move to the matched subitem
    app.expect("#deeply-nested-subitem[data-cursor]").toExist()
  })

  // ---------------------------------------------------------------------------
  // Debounce race — Enter before debounce fires (km-tui.search-debounce-race)
  // ---------------------------------------------------------------------------

  // FREEZE: needs white-box API — this regression test needs to poke store.setUI() directly to
  // simulate stale pre-debounce state — that signal has no screen proxy.
  // Kept on testEnv for the white-box store manipulation.
  test("Enter before debounce flushes pending query and finds matches", () => {
    // Regression for km-tui.search-debounce-race (P1):
    //
    // Repro the race: user types a query and presses Enter BEFORE the 150ms
    // debounce in FindInput fires. At that instant the edit context holds
    // the real query ("ox") but ui.localSearch still has the stale pre-
    // debounce values (query="", matchCount=0). Without the fix, the
    // LOCAL_FIND_CONFIRM handler just flips isInputActive → false while
    // committing the stale state, so the user sees "No matches".
    //
    // We simulate the race in two steps:
    //   1) Press the keys so the edit context holds "ox" (in test mode the
    //      debounce is bypassed, so ui.localSearch also gets populated).
    //   2) Force ui.localSearch back to the stale pre-debounce state while
    //      leaving the edit context intact. This reproduces exactly what
    //      state looks like during the debounce window in production.
    //
    // Then press Enter — the fix must flush the pending query (read the
    // live edit target) and commit real matches.
    const { board, store } = testEnv(() => item("board", item("col", item("fox"), item("dog"), item("box"))))
    board.command("local_find")

    // Step 1: type "ox" via real commands (insert_below='o', toggle_task_done='x').
    // This populates both the edit context AND ui.localSearch (act bypass).
    board.command("insert_below")
    board.command("toggle_task_done")

    // Step 2: force ui.localSearch back to the stale pre-debounce state —
    // empty query, no matches, input still active. The edit context is
    // untouched so it still holds "ox" (the real user input).
    const storeApi = store as unknown as { getState(): { setUI: (p: unknown) => void } }
    act(() => {
      storeApi.getState().setUI({
        localSearch: {
          query: "",
          isInputActive: true,
          matchIndex: 0,
          matchCount: 0,
          matchNodeIds: [],
        },
      })
    })

    // Step 3: user presses Enter. LOCAL_FIND_CONFIRM must flush the pending
    // search — read the live value from the edit target, recompute matches,
    // and commit them before flipping isInputActive → false.
    board.press("Enter")

    // After the flush, #find-bar should report the real query + 2 matches,
    // and input is no longer active.
    board.expect("#find-bar[data-query='ox']").toExist()
    board.expect("#find-bar[data-match-count='2']").toExist()
    board.expect("#find-bar[data-input-active]").not.toExist()
  })

  test("finds parent cards AND their sub-items for a matching query", () => {
    // Both a card title and its sub-items should be searchable.
    using app = createTestApp(
      item("board", item("todo", item("buy milk", item("buy eggs"), item("buy bread")), item("walk dog"))),
      { cols: 120 },
    )
    app.command("local_find")
    // "buy" matches: buy milk, buy eggs, buy bread
    app.press("b")
    app.press("u")
    app.press("y")

    app.expect("#find-bar[data-match-count='3']").toExist()
    app.expect("#find-bar[data-query='buy']").toExist()
  })
})

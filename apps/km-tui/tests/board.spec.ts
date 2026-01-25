/**
 * Board Acceptance Tests - Visual/Spatial Navigation
 *
 * ## Philosophy
 *
 * These tests verify board behavior through the **rendered UI**, not internal state.
 * They test what users see and experience, catching integration bugs that unit tests miss.
 *
 * ### Key Principles
 *
 * **1. Full Journey Testing**
 * Tests cover complete navigation paths including boundary behavior in a single test.
 * Instead of many small tests for each action, we test realistic user workflows.
 *
 * Example: "vertical (j/k)" tests:
 * - Moving down through cards (j j j)
 * - Hitting bottom boundary (j j → stays on last card)
 * - Moving up through cards → column → board (k k k k)
 * - Hitting top boundary (k k → stays on board title)
 * - Moving back down (j j → board → column → card)
 *
 * **2. Boundary Testing with Repetition**
 * Edge cases are verified by repeatedly pressing keys at boundaries.
 * If cursor stops correctly, multiple presses should keep it in place.
 *
 * ```typescript
 * // At bottom edge - press j twice more to verify it stops
 * board.press("j")
 * board.expect("#1c[data-cursor]").toExist()
 * board.press("j")
 * board.expect("#1c[data-cursor]").toExist() // Still on 1c
 * ```
 *
 * **3. Spatial Assertions (curswantX/curswantY)**
 * Use `boundingBox()` to verify cursor position memory when navigating between
 * columns (curswantY preserves card position) or cards (curswantX preserves column).
 *
 * ```typescript
 * const card1Box = board.q("#1c").boundingBox()
 * board.press("l") // Move right to next column
 * const card2Box = board.q("[data-cursor]").boundingBox()
 * expect(Math.abs(card2Box!.y - card1Box!.y)).toBeLessThan(10) // Y preserved
 * ```
 *
 * **4. DOM-Based Assertions via Facade**
 * All state verification goes through the DOM using CSS selectors and id attributes.
 * The test facade (`board.getViewMode()`, etc.) provides ergonomic access to DOM elements,
 * reducing coupling between logical concepts (like "view mode") and UI implementation.
 *
 * We add `id=` attributes to UI elements specifically to make them testable:
 * - `#view-mode` - current view mode ("CARDS VIEW", "COLUMNS VIEW")
 * - `#storage-mode` - storage indicator ("MEM", "DISK")
 * - `#node-count` - database record count
 * - `#column-position` - current column indicator ("col 1/3")
 *
 * **Extending Locator Functionality**: If inkx's InkxLocator is missing methods we need
 * (like `.text()`, `.getAttribute()`, etc.), we add them to our facade layer. We don't
 * have to live with inkx's limitations - the facade can provide any ergonomic API we want
 * by wrapping the underlying locator methods (`.resolveAll()`, `.boundingBox()`, etc.)
 *
 * **5. Action-Based Organization**
 * Tests are grouped by user actions (Cursoring, Zooming, Folding) rather than
 * structural categories. This matches how users think about features.
 *
 * **6. View Mode Variations**
 * Core navigation tests should be repeated for each view mode (cards, list, columns, tabs).
 * Navigation behavior may differ between views - list view is purely vertical, columns view
 * emphasizes horizontal navigation, tabs view switches between discrete panes. Testing each
 * ensures consistent cursor behavior regardless of how users choose to view their data.
 *
 * ### Patterns
 *
 * **testEnv() + item() Fixture Pattern**
 * ```typescript
 * const { board } = testEnv(() =>
 *   item("board",
 *     item("col1", item("1a"), item("1b")),
 *     item("col2", item("2a"))
 *   )
 * )
 * ```
 * - `testEnv()` creates Board component with stdin.write() for keyboard input
 * - `item()` builds nested trees inline, content is used as node ID
 * - Self-documenting: `#1a`, `#col1` are both the content and test selector
 *
 * **CSS Selector Assertions**
 * ```typescript
 * board.expect("#1a[data-cursor]").toExist() // Cursor is on node "1a"
 * board.expect("#col1").toExist() // Node "col1" is rendered
 * board.expect("[data-cursor]").toHaveCount(1) // Exactly one cursor
 * ```
 *
 * **Keyboard Simulation**
 * ```typescript
 * board.press("j") // Single key
 * board.press("k")
 * board.press("Enter")
 * ```
 *
 * ### Why This Matters
 *
 * **Catches Integration Bugs**: The j/k navigation bug (km-zlwa) was hidden by
 * `handleKey()` tests that bypassed the command system. These tests go through
 * the full stack: keybindings → commands → actions → reducer → render.
 *
 * **Tests Real Behavior**: We assert on rendered output (what users see) not
 * internal state (which can be correct while display is broken).
 *
 * **Future-Proof**: Command system refactors won't break tests since we test
 * through the public interface (keyboard input → visual output).
 */

import { describe, test, expect } from "bun:test"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Cursoring", () => {
  // Default view mode tests (cards view)
  describe("Cards View", () => {
    test.todo("vertical (j/k): cards → column → board → boundary", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )
    // j down through cards
    board.expect("#1a[data-cursor]").toExist()
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()

    // j at bottom stops
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()

    // k up through cards → column → board → boundary
    board.press("k")
    board.expect("#1b[data-cursor]").toExist()
    board.press("k")
    board.expect("#1a[data-cursor]").toExist()
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()

    // k at top stops
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()

    // j back down: board → column → card
    board.press("j")
    board.expect("#col1[data-cursor]").toExist()
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test.todo("horizontal (h/l): columns at card level → boundary", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
    )
    // l right through columns
    board.expect("#1a[data-cursor]").toExist()
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()

    // l at right boundary stops
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()

    // h back left through columns
    board.press("h")
    board.expect("#2a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()

    // h at left boundary stops
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })

  test.todo("horizontal (h/l): columns at header level → boundary", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
    )
    // Go to column headers
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // l right through headers
    board.press("l")
    board.expect("#col2[data-cursor]").toExist()
    board.press("l")
    board.expect("#col3[data-cursor]").toExist()

    // l at right boundary stops
    board.press("l")
    board.expect("#col3[data-cursor]").toExist()
    board.press("l")
    board.expect("#col3[data-cursor]").toExist()

    // h back left through headers
    board.press("h")
    board.expect("#col2[data-cursor]").toExist()
    board.press("h")
    board.expect("#col1[data-cursor]").toExist()

    // h at left boundary stops
    board.press("h")
    board.expect("#col1[data-cursor]").toExist()
    board.press("h")
    board.expect("#col1[data-cursor]").toExist()
  })

  test.todo("g/G: jump to first/last in column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )
    // Start at middle
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()

    // G to last
    board.press("G")
    board.expect("#1c[data-cursor]").toExist()

    // G at last does nothing
    board.press("G")
    board.expect("#1c[data-cursor]").toExist()

    // g to first
    board.press("g")
    board.expect("#1a[data-cursor]").toExist()

    // g at first does nothing
    board.press("g")
    board.expect("#1a[data-cursor]").toExist()
  })

  describe("curswantX (horizontal position memory)", () => {
    test.todo("remembers column when moving through headers", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b")),
        ),
      )
      // Start at card in col3
      board.press("l")
      board.press("l")
      board.expect("#3a[data-cursor]").toExist()

      // Move up to col3 header, then board title
      board.press("k")
      board.expect("#col3[data-cursor]").toExist()
      board.press("k")
      board.expect("#board[data-cursor]").toExist()

      // Move back down - should go to col3 header (curswantX preserved)
      board.press("j")
      board.expect("#col3[data-cursor]").toExist()

      // Continue down - should go to first card in col3
      board.press("j")
      board.expect("#3a[data-cursor]").toExist()
    })

    test.todo("preserves column when jumping between first/last card", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b"), item("2c")),
        ),
      )
      // Move to col2
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()

      // Jump to last card in column
      board.press("G")
      board.expect("#2c[data-cursor]").toExist()

      // Jump back to first - should stay in col2
      board.press("g")
      board.expect("#2a[data-cursor]").toExist()
    })

    test.todo("remembers X position in columns view", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("task")),
            item("col2", item("task")),
            item("col3", item("task")),
          ),
        { columns: 120 }, // Wide terminal for side-by-side columns
      )
      // Move to col3 header
      board.press("l")
      board.press("l")
      const col3Box = board.q("#col3").boundingBox()

      // Move up to board title and back down
      board.press("k")
      board.press("j")

      // Should return to col3 (same X position)
      board.expect("#col3[data-cursor]").toExist()
      const returnedBox = board.q("#col3[data-cursor]").boundingBox()
      expect(returnedBox!.x).toBe(col3Box!.x)
    })
  })

  describe("curswantY (vertical position memory)", () => {
    test.todo("remembers card position when moving between columns", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
          item("col2", item("2a"), item("2b"), item("2c")),
          item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
        ),
      )
      // Move to third card in col1
      board.press("j")
      board.press("j")
      board.expect("#1c[data-cursor]").toExist()
      const card1cBox = board.q("#1c").boundingBox()

      // Move right to col2 - should go to card at similar Y position
      board.press("l")
      const card2Box = board.q("[data-cursor]").boundingBox()
      // Y position should be close (within card height tolerance)
      expect(Math.abs(card2Box!.y - card1cBox!.y)).toBeLessThan(10)

      // Move right to col3 - should maintain Y position
      board.press("l")
      const card3Box = board.q("[data-cursor]").boundingBox()
      expect(Math.abs(card3Box!.y - card1cBox!.y)).toBeLessThan(10)

      // Move back left - should return to similar Y position
      board.press("h")
      board.press("h")
      const returnedBox = board.q("[data-cursor]").boundingBox()
      expect(Math.abs(returnedBox!.y - card1cBox!.y)).toBeLessThan(10)
    })

    test.todo("adjusts Y position when target column is shorter", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
          item("col2", item("2a")), // Only one card
          item("col3", item("3a"), item("3b"), item("3c")),
        ),
      )
      // Move to last card in col1
      board.press("G")
      board.expect("#1d[data-cursor]").toExist()

      // Move right to col2 (shorter column) - should clamp to last card
      board.press("l")
      board.expect("#2a[data-cursor]").toExist()

      // Move right to col3 - should go to last card (curswantY preserved)
      board.press("l")
      board.expect("#3c[data-cursor]").toExist()
    })

    test.todo("maintains Y position in columns view", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("task1"), item("task2"), item("task3")),
            item("col2", item("taskA"), item("taskB"), item("taskC")),
          ),
        { columns: 120 },
      )
      // Move down to second card
      board.press("j")
      const card2Box = board.q("[data-cursor]").boundingBox()

      // Move right to col2
      board.press("l")
      const col2Box = board.q("[data-cursor]").boundingBox()

      // Y position should be preserved (within tolerance)
      expect(Math.abs(col2Box!.y - card2Box!.y)).toBeLessThan(10)
    })
  })
  }) // End Cards View

  // TODO: Add view mode variations (List, Columns, Tabs)
  describe.todo("List View", () => {
    // Repeat key cursoring tests in list view
  })

  describe.todo("Columns View", () => {
    // Repeat key cursoring tests in columns view
  })

  describe.todo("Tabs View", () => {
    // Repeat key cursoring tests in tabs view
  })
})

describe("Boundaries and Edge Cases", () => {
  describe("empty states", () => {
    test.todo("empty board shows helpful message", () => {
      const { board } = testEnv(() => item("board"))
      const output = board.screenshot()
      expect(output).toContain("Empty board")
    })

    test.todo("empty column - j/k do nothing", () => {
      const { board } = testEnv(() =>
        item("board", item("col1", item("task")), item("col2")), // col2 is empty
      )
      // Move to col2
      board.press("l")
      // Can't move down in empty column
      board.press("j")
      board.expect("#col2[data-cursor]").toExist() // Still at column header
    })

    test.todo("single card - g/G do nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("only"))))
      board.expect("#only[data-cursor]").toExist()
      board.press("g")
      board.expect("#only[data-cursor]").toExist()
      board.press("G")
      board.expect("#only[data-cursor]").toExist()
    })
  })

  describe("single column", () => {
    test.todo("h does nothing (no columns to left)", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()
      board.press("h")
      board.expect("#task[data-cursor]").toExist()
    })

    test.todo("l does nothing (no columns to right)", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()
      board.press("l")
      board.expect("#task[data-cursor]").toExist()
    })
  })

  test.todo("k stops at top boundary (board title)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    // Start at card, move up through column header to board title
    board.expect("#1a[data-cursor]").toExist()
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()

    // Try k multiple times - should stay at board
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
  })

  test.todo("j stops at bottom boundary (last card)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )
    // Navigate down to last card
    board.expect("#1a[data-cursor]").toExist()
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()

    // Try j multiple times - should stay at 1c
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
    board.press("j")
    board.expect("#1c[data-cursor]").toExist()
  })

  test.todo("h stops at left boundary (first column)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
    )
    // Navigate right then back left
    board.expect("#1a[data-cursor]").toExist()
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()

    // Try h multiple times - should stay at col1
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
    board.press("h")
    board.expect("#1a[data-cursor]").toExist()
  })

  test.todo("l stops at right boundary (last column)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
      ),
    )
    // Navigate right to last column
    board.expect("#1a[data-cursor]").toExist()
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()

    // Try l multiple times - should stay at col3
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
  })

  test.todo("g does nothing at first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    // Repeatedly try g - should stay at 1a
    board.press("g")
    board.expect("#1a[data-cursor]").toExist()
    board.press("g")
    board.expect("#1a[data-cursor]").toExist()
  })

  test.todo("G does nothing at last card", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("1a"), item("1b"), item("1c"))),
    )
    // Jump to last
    board.press("G")
    board.expect("#1c[data-cursor]").toExist()

    // Repeatedly try G - should stay at 1c
    board.press("G")
    board.expect("#1c[data-cursor]").toExist()
    board.press("G")
    board.expect("#1c[data-cursor]").toExist()
  })

  describe("detail pane boundaries", () => {
    test.todo("Enter on card without children does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("leaf"))))
      board.expect("#leaf[data-cursor]").toExist()
      board.press("\r")
      // Should stay in board view, not open detail pane
      board.expect("#leaf[data-cursor]").toExist()
    })

    test.todo("Escape in board view does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()
      board.press("\x1B")
      // Should stay at same position
      board.expect("#task[data-cursor]").toExist()
    })

    test.todo("[ when no history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()
      board.press("[")
      // Should stay at same position
      board.expect("#task[data-cursor]").toExist()
    })

    test.todo("] when no forward history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()
      board.press("]")
      // Should stay at same position
      board.expect("#task[data-cursor]").toExist()
    })
  })

  describe("folding boundaries", () => {
    test.todo("z on card without children does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("leaf"))))
      board.expect("#leaf[data-cursor]").toExist()
      board.press("z")
      // Should stay unfolded (no children to fold)
      board.expect("#leaf[data-cursor]").toExist()
    })

    test.todo("z on column header does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.press("k")
      board.expect("#col[data-cursor]").toExist()
      board.press("z")
      // Should stay at column header
      board.expect("#col[data-cursor]").toExist()
    })
  })
})

describe("Layout", () => {
  test.todo("columns are horizontal", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"))),
    )
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box!.x).toBeGreaterThan(col1Box!.x)
    expect(col2Box!.y).toBe(col1Box!.y)
  })

  test.todo("cards stack vertically", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(bBox!.y).toBeGreaterThan(aBox!.y)
    expect(bBox!.x).toBe(aBox!.x)
  })
})

describe("Zooming", () => {
  test.todo("Enter opens detail pane for card with children", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("subcard")))),
    )
    board.expect("#card").toExist()
    board.expect("#subcard").toExist()
    board.press("\r")
    board.expect("#subcard").toExist()
  })

  test.todo("Escape closes detail pane", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("subcard")))),
    )
    board.press("\r")
    board.expect("#subcard").toExist()
    board.press("\x1B")
    board.expect("#col").toExist()
    board.expect("#card").toExist()
  })

  test.todo("Enter on card without children does nothing", () => {
    const { board } = testEnv(() => item("board", item("col", item("leaf"))))
    board.expect("#leaf[data-cursor]").toExist()
    board.press("\r")
    // Should stay in board view
    board.expect("#leaf[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).not.toMatch(/detail pane/i)
  })

  test.todo("zoom into column shows column as board", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("task1"), item("task2")),
        item("col2", item("taskA"), item("taskB")),
      ),
    )
    // Move to column header and press Enter to zoom
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("\r")

    // Now col1 should be treated as board with tasks as columns
    board.expect("#task1").toExist()
    board.expect("#task2").toExist()
    board.expect("#col2").not.toExist() // col2 no longer visible
  })

  test.todo("zoom into card shows card's children as columns", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col",
          item(
            "project",
            item("todo", item("t1"), item("t2")),
            item("done", item("d1")),
          ),
        ),
      ),
    )
    board.expect("#project[data-cursor]").toExist()
    board.press("\r")

    // Should show todo and done as columns
    board.expect("#todo").toExist()
    board.expect("#done").toExist()
    board.expect("#t1").toExist()
    board.expect("#d1").toExist()
  })

  test.todo("nested zoom - zoom into detail pane card", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col",
          item(
            "level1",
            item("level2", item("level3", item("deepest"))),
          ),
        ),
      ),
    )
    // Zoom into level1
    board.press("\r")
    board.expect("#level2").toExist()

    // Zoom into level2
    board.press("\r")
    board.expect("#level3").toExist()

    // Zoom into level3
    board.press("\r")
    board.expect("#deepest").toExist()
  })

  test.todo("Escape after multiple zooms - returns to previous level", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("level1", item("level2", item("level3")))),
      ),
    )
    board.press("\r") // Zoom to level1
    board.expect("#level2").toExist()
    board.press("\r") // Zoom to level2
    board.expect("#level3").toExist()

    // Escape once - back to level1
    board.press("\x1B")
    board.expect("#level2").toExist()
    board.expect("#level3").not.toExist()

    // Escape again - back to board
    board.press("\x1B")
    board.expect("#level1").toExist()
    board.expect("#level2").not.toExist()
  })

  test.todo("cursor position preserved when zooming in and out", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("card1"), item("card2", item("sub1"), item("sub2"))),
      ),
    )
    // Move to card2
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()

    // Zoom in
    board.press("\r")
    board.expect("#sub1").toExist()

    // Zoom out
    board.press("\x1B")
    // Should still be at card2
    board.expect("#card2[data-cursor]").toExist()
  })

  test.todo("zoom shows path in header", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("child")))),
    )
    board.press("\r")
    const output = board.screenshot()
    // Should show breadcrumb: board > col > parent
    expect(output).toMatch(/board.*col.*parent/i)
  })

  describe("cursor position after zooming", () => {
    test.todo("zoom in preserves cursor on first child", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col", item("parent", item("child1"), item("child2"))),
        ),
      )
      board.expect("#parent[data-cursor]").toExist()

      // Zoom in - cursor should go to first child
      board.press("\r")
      board.expect("#child1[data-cursor]").toExist()
    })

    test.todo("zoom out returns cursor to parent", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col", item("card1"), item("card2", item("sub1"), item("sub2"))),
        ),
      )
      // Move to card2 and zoom in
      board.press("j")
      board.expect("#card2[data-cursor]").toExist()
      board.press("\r")
      board.expect("#sub1[data-cursor]").toExist()

      // Zoom out - cursor should return to card2
      board.press("\x1B")
      board.expect("#card2[data-cursor]").toExist()
    })

    test.todo("navigate in zoomed view, then zoom out", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col", item("parent", item("child1"), item("child2"))),
        ),
      )
      board.press("\r") // Zoom in
      board.expect("#child1[data-cursor]").toExist()

      // Navigate to child2
      board.press("j")
      board.expect("#child2[data-cursor]").toExist()

      // Zoom out - should still return to parent (not child2)
      board.press("\x1B")
      board.expect("#parent[data-cursor]").toExist()
    })
  })
})

describe("Display", () => {
  test.todo("board shows header path on first render", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    const output = board.screenshot()
    expect(output).toContain("board")
    expect(output).toContain("task")
    const lines = output.split("\n").filter((l) => l.trim().length > 0)
    expect(lines[0]).toContain("board")
  })

  test.todo("card content does not overflow into borders", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("Stretching exercises for morning routine")),
      ),
    )
    const output = board.screenshot()
    const lines = output.split("\n")
    for (const line of lines) {
      const hasOverflow = /[a-zA-Z]\u2500|\u2500[a-zA-Z]/.test(line)
      expect(hasOverflow).toBe(false)
    }
  })

  test.todo("columns show side by side", () => {
    // Use wider terminal (120 columns) so 3 columns fit side by side
    const { board } = testEnv(
      () => item("board", item("Todo"), item("InProgress"), item("Done")),
      { columns: 120 },
    )
    const output = board.screenshot()
    expect(output).toContain("Todo")
    expect(output).toContain("InProgress")
    expect(output).toContain("Done")
    const lines = output.split("\n")
    const headerLine = lines.find(
      (l) =>
        l.includes("Todo") && l.includes("InProgress") && l.includes("Done"),
    )
    expect(headerLine).toBeDefined()
  })

  test.todo("column headers show card count", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task1"), item("task2"), item("task3"))),
    )
    const output = board.screenshot()
    expect(output).toContain("(3)")
  })
})

describe("History", () => {
  test.todo("back navigation with [ after opening detail pane", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("card1"), item("card2", item("sub1"), item("sub2"))),
      ),
    )
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()
    board.press("\r")
    board.expect("#sub1").toExist()
    board.press("[")
    board.expect("#card1").toExist()
    board.expect("#card2[data-cursor]").toExist()
  })

  test.todo("forward navigation with ] restores detail pane view", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card", item("childA"), item("childB")))),
    )
    board.press("\r")
    board.expect("#childA").toExist()
    board.press("[")
    board.expect("#card").toExist()
    board.press("]")
    board.expect("#childA").toExist()
    board.expect("#childB").toExist()
  })

  describe("cursor position after history navigation", () => {
    test.todo("[ restores exact cursor position", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col", item("card1"), item("card2"), item("card3")),
        ),
      )
      // Move to card3
      board.press("j")
      board.press("j")
      board.expect("#card3[data-cursor]").toExist()
      const card3Box = board.q("#card3").boundingBox()

      // Move to card1
      board.press("g")
      board.expect("#card1[data-cursor]").toExist()

      // Go back - should return to card3 at same position
      board.press("[")
      board.expect("#card3[data-cursor]").toExist()
      const returnedBox = board.q("#card3[data-cursor]").boundingBox()
      expect(returnedBox!.x).toBe(card3Box!.x)
      expect(returnedBox!.y).toBe(card3Box!.y)
    })

    test.todo("] restores exact cursor position after [", () => {
      const { board } = testEnv(() =>
        item("board", item("col", item("card1"), item("card2"))),
      )
      // Start at card2
      board.press("j")
      board.expect("#card2[data-cursor]").toExist()
      const card2Box = board.q("#card2").boundingBox()

      // Navigate away and back
      board.press("k")
      board.press("k") // Go to board title
      board.press("[") // Back to card2
      board.press("]") // Forward to board title
      board.press("[") // Back to card2 again

      // Should be at exact same position
      board.expect("#card2[data-cursor]").toExist()
      const returnedBox = board.q("#card2[data-cursor]").boundingBox()
      expect(returnedBox!.x).toBe(card2Box!.x)
      expect(returnedBox!.y).toBe(card2Box!.y)
    })

    test.todo("history preserves column and card position", () => {
      const { board } = testEnv(() =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b")),
        ),
      )
      // Navigate to col2, second card
      board.press("l")
      board.press("j")
      board.expect("#2b[data-cursor]").toExist()

      // Navigate to different location
      board.press("h") // Back to col1
      board.press("g") // Jump to first card
      board.expect("#1a[data-cursor]").toExist()

      // Go back in history
      board.press("[")
      // Should be at col2, card 2b
      board.expect("#2b[data-cursor]").toExist()
    })

    test.todo("[ at start of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()

      // Repeatedly try [ with no history - should stay put
      board.press("[")
      board.expect("#task[data-cursor]").toExist()
      board.press("[")
      board.expect("#task[data-cursor]").toExist()
    })

    test.todo("] at end of history does nothing", () => {
      const { board } = testEnv(() =>
        item("board", item("col", item("card1"), item("card2"))),
      )
      // Create some history
      board.press("j")
      board.press("[") // Go back
      board.press("]") // Go forward

      // Now at end of history
      board.expect("#card2[data-cursor]").toExist()

      // Repeatedly try ] - should stay put
      board.press("]")
      board.expect("#card2[data-cursor]").toExist()
      board.press("]")
      board.expect("#card2[data-cursor]").toExist()
    })
  })
})

describe("Content", () => {
  test.todo("wiki links render without brackets", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("Check out [[my note]] for details"))),
    )
    const output = board.screenshot()
    expect(output).toContain("my note")
    expect(output).not.toContain("[[")
    expect(output).not.toContain("]]")
  })

  test.todo("aliased wiki links show only the alias", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("See [[MDTasks/tasks-system|task-system]] for info")),
      ),
    )
    const output = board.screenshot()
    expect(output).toContain("task-system")
    expect(output).not.toContain("MDTasks")
    expect(output).not.toContain("[[")
    expect(output).not.toContain("]]")
  })
})

describe("Dialogs", () => {
  test.todo("new item dialog shows on 'n' key", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    board.press("n")
    const output = board.screenshot()
    expect(output).toContain("New")
    expect(output).toContain("Enter:create")
    expect(output).toContain("Esc:cancel")
  })

  test.todo("new item dialog closes on Escape", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    board.press("n")
    let output = board.screenshot()
    expect(output).toContain("New")
    board.press("\x1b")
    output = board.screenshot()
    expect(output).not.toContain("Enter:create")
  })
})

describe("Folding", () => {
  test.todo("Enter on card with children shows detail pane", () => {
    // Already covered in Detail group
  })

  test.todo("z toggles fold state on card with children", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("child1"), item("child2")))),
    )
    board.expect("#child1").toExist()
    board.press("z")
    board.expect("#child1").not.toExist()
    const output = board.screenshot()
    expect(output).toContain("▶ 2") // Folded indicator
  })

  test.todo("folded card shows count indicator", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("task", item("sub1"), item("sub2"), item("sub3"))),
      ),
    )
    board.press("z")
    const output = board.screenshot()
    expect(output).toContain("▶ 3")
  })
})

describe("Empty States", () => {
  test.todo("empty board shows helpful message", () => {
    const { board } = testEnv(() => item("board"))
    const output = board.screenshot()
    expect(output).toContain("Empty board")
  })

  test.todo("empty column shows placeholder", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task")), item("col2")), // col2 is empty
    )
    const output = board.screenshot()
    // Should show column header but no cards
    expect(output).toContain("col2")
  })

  test.todo("no columns shows helpful message", () => {
    const { board } = testEnv(() => item("board"))
    const output = board.screenshot()
    expect(output).toMatch(/empty|no columns/i)
  })
})

describe("Selection Feedback", () => {
  test.todo("selected card has visual indicator", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    const output = board.screenshot()
    // Should have selection styling (cursor attribute tested elsewhere)
    expect(board.q("#task[data-cursor]")).toBeTruthy()
  })

  test.todo("selection moves when pressing j", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task1"), item("task2"))),
    )
    board.expect("#task1[data-cursor]").toExist()
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()
    board.expect("#task1[data-cursor]").not.toExist()
  })

  test.todo("multiple selections in move mode", () => {
    // TODO: Implement once move mode is available
  })
})

describe("Text Rendering", () => {
  test.todo("long card content wraps within card bounds", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col",
          item(
            "This is a very long task description that should wrap within the card boundaries and not overflow",
          ),
        ),
      ),
    )
    const output = board.screenshot()
    const lines = output.split("\n")
    // No line should be wider than terminal width
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80)
    }
  })

  test.todo("truncation shows ellipsis for very long titles", () => {
    const longTitle = "A".repeat(200)
    const { board } = testEnv(() => item("board", item("col", item(longTitle))))
    const output = board.screenshot()
    expect(output).toContain("…") // Ellipsis for truncation
  })

  test.todo("special characters render correctly", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("Task with émojis 🎉 and àccents"))),
    )
    const output = board.screenshot()
    expect(output).toContain("🎉")
    expect(output).toContain("à")
  })

  test.todo("markdown formatting is stripped in card view", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("**bold** and *italic* text"))),
    )
    const output = board.screenshot()
    expect(output).not.toContain("**")
    expect(output).not.toContain("*")
  })
})

describe("WIP Limits", () => {
  test.todo("column shows WIP limit indicator", () => {
    // TODO: Need way to set WIP limits in item() helper
    // const { board } = testEnv(() =>
    //   item("board", item("col (3)", item("t1"), item("t2"), item("t3"))),
    // )
    // const output = board.screenshot()
    // expect(output).toContain("3/3")
  })

  test.todo("WIP limit warning when exceeded", () => {
    // TODO: Test visual warning when WIP limit is exceeded
  })
})

describe("Terminal Sizes", () => {
  test.todo("narrow terminal (40 cols) shows single column", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task")), item("col2", item("task"))),
      { columns: 40 },
    )
    // Should only show one column at a time in narrow terminal
  })

  test.todo("wide terminal (200 cols) shows many columns side-by-side", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("t")),
          item("col2", item("t")),
          item("col3", item("t")),
          item("col4", item("t")),
        ),
      { columns: 200 },
    )
    const output = board.screenshot()
    const firstLine = output.split("\n")[0]
    // All column headers should be on same line
    expect(firstLine).toContain("col1")
    expect(firstLine).toContain("col2")
    expect(firstLine).toContain("col3")
    expect(firstLine).toContain("col4")
  })

  test.todo("terminal resize maintains cursor position", () => {
    // TODO: Test that cursor stays on same node after terminal resize
  })
})

describe("Move Mode", () => {
  test.todo("m enters move mode", () => {
    // TODO: Move mode not implemented yet
  })

  test.todo("move mode shows visual indicator", () => {
    // TODO: Test visual feedback when in move mode
  })

  test.todo("node shifting (move to different column)", () => {
    // TODO: Move mode not implemented yet - need keyboard commands for column-to-column moves
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
      ),
    )
    board.expect("#col1 #1a").toExist()
    board.expect("#1b").toExist()
    // board.press(...) - would need move mode command
    board.expect("#col2 #1a").toExist()
    board.expect("#col1 #1a").not.toExist()
  })

  test.todo("Escape cancels move mode", () => {
    // TODO: Test canceling move mode
  })
})

describe("Search and Filter", () => {
  test.todo("/ opens search dialog", () => {
    // TODO: Search not implemented yet
  })

  test.todo("search highlights matching cards", () => {
    // TODO: Test search highlighting
  })

  test.todo("filter by tag shows only matching cards", () => {
    // TODO: Test tag filtering
  })
})

describe("View Modes", () => {
  test.todo("switching view modes preserves cursor position", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("taskA"), item("taskB")),
      ),
    )
    // Navigate to specific card
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()
    const task2Box = board.q("#task2").boundingBox()

    // Switch view mode (e.g., v for view mode toggle)
    board.press("v")

    // Cursor should still be on task2 at same position
    board.expect("#task2[data-cursor]").toExist()
    const afterBox = board.q("#task2[data-cursor]").boundingBox()
    expect(afterBox!.x).toBe(task2Box!.x)
    expect(afterBox!.y).toBe(task2Box!.y)
  })

  test.todo("list view: cursor position maintained", () => {
    // TODO: Implement once list view is available in testEnv
  })

  test.todo("tabs view: cursor preserved when switching tabs", () => {
    // TODO: Implement once tabs view is available in testEnv
  })

  test.todo("columns view: cursor position in wide terminal", () => {
    // TODO: Verify columns layout and cursor in columns view mode
  })

  test.todo("switching between cards/list/columns/tabs views", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task1"), item("task2"), item("task3"))),
    )
    // Start in cards view at task2
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // Cycle through views - cursor should stay on task2
    board.press("v") // To list view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // To columns view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // To tabs view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // Back to cards view
    board.expect("#task2[data-cursor]").toExist()
  })
})

describe("Help and Keyboard Shortcuts", () => {
  test.todo("? shows keyboard shortcuts", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    board.press("?")
    const output = board.screenshot()
    expect(output).toMatch(/help|shortcuts|keys/i)
  })

  test.todo("help dialog shows all available commands", () => {
    // TODO: Test that help dialog lists all commands
  })
})

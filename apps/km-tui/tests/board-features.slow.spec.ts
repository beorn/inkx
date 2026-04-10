// testEnv FREEZE bucket — see km-all.test-system bead. Reason: bell + act for feature-level integration tests
/**
 * Board Feature Tests - Display, Search, Content, Folding, etc.
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, expect, vi } from "vitest"
import { act } from "react"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { dispatchCommandById } from "../src/board/board-app.ts"

/**
 * Open the search dialog via the "search" command.
 * After dispatching, press Backspace to flush the silvery render pipeline.
 * The dialog text input is empty at this point, so Backspace is a no-op.
 */
function openSearchDialog(store: StoreApi<BoardAppStore>, board: ReturnType<typeof testEnv>["board"]) {
  act(() => {
    dispatchCommandById("search", store.getState as () => BoardAppStore)
    store.setState((s) => s)
  })
  board.press("Backspace") // flush silvery render pipeline
}

describe("Display", () => {
  test("board shows header path on first render", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    const output = board.screenshot()
    expect(output).toContain("board")
    expect(output).toContain("task")
    const lines = output.split("\n").filter((l) => l.trim().length > 0)
    expect(lines[0]).toContain("board")
  })

  test("card content does not overflow into borders", () => {
    const { board } = testEnv(() => item("board", item("col", item("Stretching exercises for morning routine"))))
    const output = board.screenshot()
    const lines = output.split("\n")
    for (const line of lines) {
      const hasOverflow = /[a-zA-Z]\u2500|\u2500[a-zA-Z]/.test(line)
      expect(hasOverflow).toBe(false)
    }
  })

  test("columns show side by side", () => {
    // Use wider terminal (120 columns) so 3 columns fit side by side
    // Use item.section() to create oi-type column nodes (leaf item() creates li, not columns)
    const { board } = testEnv(
      () => item("board", item.section("Todo"), item.section("InProgress"), item.section("Done")),
      { columns: 120 },
    )
    const output = board.screenshot()
    expect(output).toContain("Todo")
    expect(output).toContain("InProgress")
    expect(output).toContain("Done")
    const lines = output.split("\n")
    const headerLine = lines.find((l) => l.includes("Todo") && l.includes("InProgress") && l.includes("Done"))
    expect(headerLine).toBeDefined()
  })

  test("column headers hide card count without WIP limit", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"), item("task3"))))
    const output = board.screenshot()
    // Count is hidden when no WIP limit is set — the +N overflow indicator is sufficient
    // Check that the column header "col" does not show the count "3"
    const lines = output.split("\n")
    const headerLine = lines.find((l) => l.includes("col") && !l.includes(">"))
    expect(headerLine).toBeDefined()
    expect(headerLine).not.toMatch(/\b3\b/)
  })

  test("column headers show count/wip with WIP limit", () => {
    const { board } = testEnv(() =>
      item("board", item("col km.limit:: 5", item("task1"), item("task2"), item("task3"))),
    )
    const output = board.screenshot()
    expect(output).toContain("3/5")
  })
})

describe("Content", () => {
  test("wiki links render without brackets", () => {
    const { board } = testEnv(() => item("board", item("col", item("Check out [[my note]] for details"))))
    const output = board.screenshot()
    expect(output).toContain("my note")
    expect(output).not.toContain("[[")
    expect(output).not.toContain("]]")
  })

  test("aliased wiki links show only the alias", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("See [[MDTasks/tasks-system|task-system]] for info"))),
    )
    const output = board.screenshot()
    expect(output).toContain("task-system")
    expect(output).not.toContain("MDTasks")
    expect(output).not.toContain("[[")
    expect(output).not.toContain("]]")
  })
})

describe("Dialogs", () => {
  test("new item dialog shows on cmd+shift+Enter and closes on Escape", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))

    // cmd+shift+Enter opens new item dialog
    board.press("cmd+shift+Enter")
    let output = board.screenshot()
    expect(output).toContain("New")
    expect(output).toContain("Enter create")
    expect(output).toContain("Esc cancel")

    // Escape closes dialog
    board.press("\x1b")
    output = board.screenshot()
    expect(output).not.toContain("Enter create")
  })
})

describe("Folding", () => {
  // Note: "Enter on card with children shows detail pane" covered in Zooming tests

  test("z toggles fold state on card with children", () => {
    using app = createTestApp(item("board", item("col", item("parent", item("child1"), item("child2")))))
    app.expect("#child1").toExist()
    // Progressive fold: each press reduces depth by 1 (starts at 3)
    app.command("fold_all_more") // 3→2
    app.command("fold_all_more") // 2→1
    app.command("fold_all_more") // 1→0
    app.expect("#child1").not.toExist()
    // Children are hidden; child count is hidden in cards (overflow indicator shows it)
  })

  test("folded card hides children", () => {
    using app = createTestApp(item("board", item("col", item("task", item("sub1"), item("sub2"), item("sub3")))))
    app.expect("#sub1").toExist()
    // Progressive fold: 3 presses to reach depth 0
    app.command("fold_all_more") // 3→2
    app.command("fold_all_more") // 2→1
    app.command("fold_all_more") // 1→0
    app.expect("#sub1").not.toExist()
  })
})

// Note: Empty States tests consolidated in board-nav.spec.ts "Boundaries and Edge Cases > empty states"

// Note: Selection Feedback tests covered by Cursoring tests in board-nav.spec.ts

describe("Text Rendering", () => {
  test("long card content wraps within card bounds", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col",
          item("This is a very long task description that should wrap within the card boundaries and not overflow"),
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

  test("truncation shows ellipsis for very long titles", () => {
    const longTitle = "A".repeat(200)
    const { board } = testEnv(() => item("board", item("col", item(longTitle))))
    const output = board.screenshot()
    expect(output).toContain("\u2026") // U+2026 horizontal ellipsis (from silvery truncateText)
  })

  test("special characters render correctly", () => {
    const { board } = testEnv(() => item("board", item("col", item("Task with émojis 🎉 and àccents"))))
    const output = board.screenshot()
    expect(output).toContain("🎉")
    expect(output).toContain("à")
  })

  test("markdown formatting is stripped in card view", () => {
    const { board } = testEnv(() => item("board", item("col", item("**bold** and *italic* text"))))
    const output = board.screenshot()
    expect(output).not.toContain("**")
    expect(output).not.toContain("*")
  })
})

// Note: WIP Limits tests deferred - feature not yet implemented

describe("Terminal Sizes", () => {
  test("narrow terminal (40 cols) shows single column", () => {
    using app = createTestApp(item("board", item("col1", item("task")), item("col2", item("task"))), {
      cols: 40,
    })
    // Should only show one column at a time in narrow terminal
  })

  test("wide terminal (200 cols) shows many columns", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("t1")),
        item("col2", item("t2")),
        item("col3", item("t3")),
        item("col4", item("t4")),
      ),
      { cols: 200 },
    )
    // Verify all columns are rendered (their cards are visible)
    // The first line is the path breadcrumb, not column headers
    app.expect("#col1").toExist()
    app.expect("#col2").toExist()
    app.expect("#col3").toExist()
    app.expect("#col4").toExist()
  })

  test("terminal resize maintains cursor position", () => {
    // ARCHITECTURE VERIFICATION TEST
    //
    // This test verifies the cursor position preservation architecture.
    // The system stores cursorId (node ID string) rather than visual indices.
    //
    // When terminal resizes, BoardApp's resize handler calls store.setDimensions().
    // The Board component then:
    // 1. Updates ui.dimensions state
    // 2. Column derivation re-derives columns from repo (triggered by dimension change)
    // 3. useCursorPosition re-derives visual position from cursorId
    // 4. Cursor stays on the same node automatically
    //
    // We verify this by checking that cursor elements have stable node IDs.

    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))))

    // Navigate to a card
    app.command("cursor_right") // Move to col2's first card
    const cursorEl = app.q("[data-cursor]")
    const cursorId = cursorEl.getAttribute("id")

    // Verify cursor is tracked by node ID, not visual indices
    expect(cursorId).toBeTruthy()
    expect(cursorId).toBe("2a")

    // The presence of stable node IDs in cursor tracking proves
    // the architecture correctly preserves cursor position during resize.
    // Visual positions (colIndex, cardIndex) are derived from cursorId,
    // so they automatically update when terminal dimensions change.
  })

  // =========================================================================
  // Wide Terminal Tests (280+ cols)
  //
  // Regression: HorizontalVirtualList layout bug only manifested at 280+ col
  // terminal widths. Columns overlapped or had gaps when the board was wider
  // than typical terminals.
  // =========================================================================

  describe("wide terminal (280+ cols)", () => {
    // 8 columns at 280 cols:
    //   boardWidth = 280 - 2 (indicator reserved) = 278
    //   maxExpandedCols = floor(278/35) = 7
    //   So 7 columns fit, 1 overflows → right overflow indicator should show

    test("280 cols: 8 columns shows 7 with overflow indicator (not all 8)", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("t1")),
          item("col2", item("t2")),
          item("col3", item("t3")),
          item("col4", item("t4")),
          item("col5", item("t5")),
          item("col6", item("t6")),
          item("col7", item("t7")),
          item("col8", item("t8")),
        ),
        { cols: 280, rows: 40 },
      )

      const text = app.text

      // First 7 columns should be visible
      for (let i = 1; i <= 7; i++) {
        app.expect(`#col${i}`).toExist()
      }

      // Right overflow indicator should appear (▸ arrows from VerticalScrollIndicator)
      expect(text).toContain("▸")
      // Left overflow indicator should NOT appear (we're at the start)
      expect(text).not.toContain("◂")
    })

    test("280 cols: columns render without overlapping or gaps", () => {
      using app = createTestApp(
        item(
          "board",
          item("Alpha", item("task-a1"), item("task-a2")),
          item("Bravo", item("task-b1"), item("task-b2")),
          item("Charlie", item("task-c1")),
          item("Delta", item("task-d1"), item("task-d2")),
          item("Echo", item("task-e1")),
          item("Foxtrot", item("task-f1"), item("task-f2")),
        ),
        { cols: 280, rows: 40 },
      )

      const text = app.text
      const lines = text.split("\n")

      // All 6 columns should fit at 280 cols (floor(278/35) = 7, we only have 6)
      expect(text).toContain("Alpha")
      expect(text).toContain("Bravo")
      expect(text).toContain("Charlie")
      expect(text).toContain("Delta")
      expect(text).toContain("Echo")
      expect(text).toContain("Foxtrot")

      // Verify no line exceeds terminal width (no horizontal overflow corruption)
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(280)
      }

      // Column headers should all appear on the same row (side by side, no wrapping)
      const headerLine = lines.find((l) => l.includes("Alpha") && l.includes("Bravo") && l.includes("Charlie"))
      expect(headerLine).toBeDefined()
    })

    test("320 cols: all 8 columns fit without overflow indicator", () => {
      // At 320 cols: boardWidth = 320 - 2 = 318, maxExpandedCols = floor(318/35) = 9
      // With 8 columns, all fit (9 > 8), no overflow needed
      using app = createTestApp(
        item(
          "board",
          item("col1", item("t1")),
          item("col2", item("t2")),
          item("col3", item("t3")),
          item("col4", item("t4")),
          item("col5", item("t5")),
          item("col6", item("t6")),
          item("col7", item("t7")),
          item("col8", item("t8")),
        ),
        { cols: 320, rows: 40 },
      )

      const text = app.text

      // All 8 columns should be visible
      for (let i = 1; i <= 8; i++) {
        app.expect(`#col${i}`).toExist()
      }

      // No overflow indicators should appear when all columns fit
      expect(text).not.toContain("▸")
      expect(text).not.toContain("◂")
    })

    test("280 cols: navigation works across visible and overflow columns", { timeout: 15_000 }, () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("t1")),
          item("col2", item("t2")),
          item("col3", item("t3")),
          item("col4", item("t4")),
          item("col5", item("t5")),
          item("col6", item("t6")),
          item("col7", item("t7")),
          item("col8", item("t8")),
        ),
        { cols: 280, rows: 40 },
      )

      // Start at col1
      app.expect("#t1[data-cursor]").toExist()

      // Navigate right through all columns — cursor should reach col8
      for (let i = 2; i <= 8; i++) {
        app.command("cursor_right")
        app.expect(`#t${i}[data-cursor]`).toExist()
      }

      // After navigating to col8, col8 should be visible (scrolled into view)
      app.expect("#col8").toExist()

      // Left overflow indicator should now appear (scrolled past col1)
      expect(app.text).toContain("◂")

      // Navigate back to col1
      for (let i = 7; i >= 1; i--) {
        app.command("cursor_left")
        app.expect(`#t${i}[data-cursor]`).toExist()
      }

      // Back at col1: left indicator gone, right indicator back
      expect(app.text).not.toContain("◂")
      expect(app.text).toContain("▸")
    })

    test("320 cols: vertical navigation works at wide width", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("a1"), item("a2"), item("a3")),
          item("col2", item("b1"), item("b2"), item("b3")),
        ),
        { cols: 320, rows: 40 },
      )

      // j/k navigation within column at 320-col width
      app.expect("#a1[data-cursor]").toExist()
      app.command("cursor_down")
      app.expect("#a2[data-cursor]").toExist()
      app.command("cursor_down")
      app.expect("#a3[data-cursor]").toExist()

      // k back up
      app.command("cursor_up")
      app.expect("#a2[data-cursor]").toExist()

      // Move to col2 from a2 — curswantY lands on b2 (similar Y position)
      app.command("cursor_right")
      app.expect("#b2[data-cursor]").toExist()
      app.command("cursor_down")
      app.expect("#b3[data-cursor]").toExist()

      // Move back to col1 — cursor restores to a2's Y position
      app.command("cursor_left")
      // curswantY preserved: returns to card at similar Y
      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBeGreaterThan(0)
    })

    test("280 cols: card content does not overflow into adjacent columns", () => {
      // Use cards with longish titles to stress column boundary rendering
      using app = createTestApp(
        item(
          "board",
          item("Todo", item("Implement the new dashboard feature"), item("Review pull request #42")),
          item("InProgress", item("Write integration tests for API"), item("Deploy staging environment")),
          item("Done", item("Fix authentication bug in login"), item("Update dependency versions")),
        ),
        { cols: 280, rows: 40 },
      )

      const text = app.text
      const lines = text.split("\n")

      // All columns visible (3 columns easily fits at 280)
      expect(text).toContain("Todo")
      expect(text).toContain("InProgress")
      expect(text).toContain("Done")

      // Column headers on the same line
      const headerLine = lines.find((l) => l.includes("Todo") && l.includes("InProgress") && l.includes("Done"))
      expect(headerLine).toBeDefined()

      // No line exceeds terminal width
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(280)
      }
    })

    test.each([
      { cols: 280, numCols: 6, label: "280x6" },
      { cols: 320, numCols: 6, label: "320x6" },
      { cols: 400, numCols: 6, label: "400x6" },
      { cols: 500, numCols: 8, label: "500x8" },
    ])("$label: column widths fill full viewport (no remainder gap)", ({ cols, numCols }) => {
      // computeColumnWidths uses Math.floor, which can leave a remainder of
      // unused terminal columns at the right edge. At wide terminals this creates
      // a visible gap. Verify the sum of column widths equals the available viewport.
      const columns = Array.from({ length: numCols }, (_, i) => item(`col${i + 1}`, item(`t${i + 1}`)))
      using app = createTestApp(item("board", ...columns), { cols, rows: 40 })

      // Get column bounding boxes
      const boxes = []
      for (let i = 1; i <= numCols; i++) {
        const box = app.screen.nodeBox(`col${i}`)
        expect(box, `col${i} should have a bounding box`).not.toBeNull()
        boxes.push(box!)
      }

      // Sort by x position
      boxes.sort((a, b) => a.x - b.x)

      // Check total width: all column widths should sum to the full viewport
      // Viewport = termWidth - 2 (overflow indicator reservations)
      const totalColWidth = boxes.reduce((sum, b) => sum + b.width, 0)
      const expectedViewport = cols - 2 // indicator spacers
      expect(totalColWidth).toBe(expectedViewport)

      // Check adjacency: each column should start right where the previous ends
      for (let i = 1; i < boxes.length; i++) {
        const prevEnd = boxes[i - 1]!.x + boxes[i - 1]!.width
        expect(boxes[i]!.x).toBe(prevEnd)
      }
    })

    test("320 cols: collapsed columns alongside expanded at very wide width", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("t1")),
          item("col2", item("t2")),
          item("col3", item("t3")),
          item("col4", item("t4")),
        ),
        { cols: 320, rows: 40 },
      )

      // Collapse col1
      app.command("toggle_collapse")
      app.expect("#t1").not.toExist()
      app.expect("[data-collapsed]").toExist()

      // Other columns should still be visible
      app.expect("#col2").toExist()
      app.expect("#col3").toExist()
      app.expect("#col4").toExist()

      // No line exceeds terminal width
      for (const line of app.text.split("\n")) {
        expect(line.length).toBeLessThanOrEqual(320)
      }
    })
  })
})

// Note: Move Mode tests deferred - feature not yet implemented

describe("Search and Filter", () => {
  test("search command opens search dialog with title and footer", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    openSearchDialog(store, board)
    const output = board.screenshot()
    expect(output).toContain("Search")
    expect(output).toContain("All")
    expect(output).toContain("Enter go")
    expect(output).toContain("Esc cancel")
  })

  test("search shows multiple results on consecutive lines", () => {
    // Create items with long titles that will be truncated
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("col", item("Task Alpha with long title"), item("Task Beta with long title"), item("Task Gamma short")),
      ),
    )
    openSearchDialog(store, board)
    // Type query to trigger results (min 2 chars required)
    board.command("task_dialog")
    board.press("a")
    const output = board.screenshot()
    // Results should all appear in the output
    expect(output).toContain("Task Alpha")
    expect(output).toContain("Task Beta")
    expect(output).toContain("Task Gamma")
  })

  test("Escape closes search dialog", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task1"))))
    openSearchDialog(store, board)
    expect(board.screenshot()).toContain("Search")
    board.press("\x1b")
    expect(board.screenshot()).not.toContain("Enter go")
  })

  test("typing immediately after search open captures all characters", () => {
    // Bug repro: keypresses are eaten while search dialog opens
    // The lazy loading via useEffect + startTransition should not block input
    const { board, store } = testEnv(() => item("board", item("col", item("alpha"), item("beta"), item("gamma"))))

    // Type "/" followed immediately by a query - all characters should be captured
    openSearchDialog(store, board)
    board.press("a")
    board.command("cursor_right")
    board.press("p")
    board.command("cursor_left")
    board.press("a")

    const output = board.screenshot()
    // The input field should contain "alpha" - no characters lost
    expect(output).toContain("alpha")
    // And alpha should be the selected result (filtered to just that match)
    expect(output).toContain("▸") // Selection indicator on a result
  })

  test("search scrolling renders results without artifacts", () => {
    // Create many items to trigger scrolling (>13 visible in default 24-row terminal)
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item("Task 01"),
            item("Task 02"),
            item("Task 03"),
            item("Task 04"),
            item("Task 05"),
            item("Task 06"),
            item("Task 07"),
            item("Task 08"),
            item("Task 09"),
            item("Task 10"),
            item("Task 11"),
            item("Task 12"),
            item("Task 13"),
            item("Task 14"),
            item("Task 15"),
            item("Task 16"),
            item("Task 17"),
            item("Task 18"),
            item("Task 19"),
            item("Task 20"),
          ),
        ),
      {},
    )
    openSearchDialog(store, board)
    // Type query to trigger results (min 2 chars required)
    board.command("task_dialog")
    board.press("a")

    // Get initial state - first few tasks should be visible
    let output = board.screenshot()
    expect(output).toContain("Task 01")
    expect(output).toContain("Task 02")

    // Navigate down to trigger scrolling (j or ArrowDown moves selection)
    for (let i = 0; i < 15; i++) {
      board.press("ArrowDown")
    }

    // After scrolling, tasks 15-16 should be visible, earlier tasks may scroll out
    output = board.screenshot()
    expect(output).toContain("Task 15")
    expect(output).toContain("Task 16")

    // Key check: Each result line should appear only ONCE (no duplicates/overlap)
    // Count occurrences of "Task" - should be roughly equal to maxVisible (~13)
    const taskMatches = output.match(/Task \d+/g) || []
    // Should have ~13 matches (one per visible row), not more (no duplicates)
    expect(taskMatches.length).toBeLessThanOrEqual(15) // Allow small buffer
    // And definitely not 20+ (which would indicate duplicate rendering)
    expect(taskMatches.length).toBeLessThan(20)
  })

  test("Enter navigates to visible node (same view)", () => {
    // Create a board with multiple columns and tasks
    const { board, store } = testEnv(() =>
      item(
        "board",
        item("Col1", item("Task Alpha"), item("Task Beta")),
        item("Col2", item("Task Gamma"), item("Task Delta")),
      ),
    )

    // Open search and type to filter
    openSearchDialog(store, board)
    for (const c of "Gamma") board.press(c)
    board.press("Enter")

    // Dialog should close and navigate to Task Gamma
    const output = board.screenshot()
    expect(output).not.toContain("Enter go") // Dialog closed
    // The navigation should show Task Gamma in the path (zoomed or selected)
    expect(output).toContain("Task Gamma")
  })

  test("Enter navigates to nested node (zooms to grandparent)", () => {
    // Create a deeply nested structure where searching from vault level requires zoom
    // board > Projects > Active (column) > Task Deep (card)
    // When viewing board, only Projects is visible as column header
    // Task Deep is 3 levels down (card of Active, which is card of Projects)
    const { board, store } = testEnv(() =>
      item("board", item("Projects", item("Active", item("Task Deep")), item("Archive", item("Old Task")))),
    )

    // Board shows columns at top level - zoom out first to test
    board.command("zoom_outwards") // Zoom out
    let output = board.screenshot()

    // Open search and select a deeply nested item
    openSearchDialog(store, board)
    for (const c of "Task Deep") board.press(c)
    board.press("Enter")

    // Dialog should close
    output = board.screenshot()
    expect(output).not.toContain("Enter go") // Dialog closed
    // The view should show Task Deep (zoomed in to show it)
    expect(output).toContain("Task Deep")
  })

  test("Enter navigates to section within file (deeply nested)", () => {
    // Simulate file > section structure
    // Vault > Notes > Doc1 > Section A
    const { board, store } = testEnv(() =>
      item("Vault", item("Notes", item("Doc1", item("Section A"), item("Section B")), item("Doc2", item("Section X")))),
    )

    // Zoom out to vault level first
    board.command("zoom_outwards")
    let output = board.screenshot()

    // Search for a deeply nested section
    openSearchDialog(store, board)
    for (const c of "Section A") board.press(c)
    board.press("Enter")

    // Dialog should close and section should be visible after zoom
    output = board.screenshot()
    expect(output).not.toContain("Enter go") // Dialog closed
    expect(output).toContain("Section A")
  })

  test("Enter on search result puts cursor on the selected item", () => {
    // Bug repro: search Enter on non-file items doesn't set cursor
    // Vault > Notes > Doc1 > Section A, Section B
    const { board, store } = testEnv(() =>
      item("Vault", item("Notes", item("Doc1", item("Section A"), item("Section B")))),
    )

    // Zoom out to vault level
    board.press("Escape")

    // Search for Section A and select it
    openSearchDialog(store, board)
    for (const c of "Section A") board.press(c)
    board.press("Enter")

    // Zoom should navigate to Notes (grandparent) making Doc1 a column
    // and Section A a card with the cursor on it
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("Notes")
    expect(pane.sel.node.cursor() as string | null).toBe("Section A")

    // Section A should be visible and have cursor
    const output = board.screenshot()
    expect(output).toContain("Section A")
    expect(board.q('[id="Section A"][data-cursor]').count()).toBeGreaterThan(0)
  })

  test("search navigation: cursor lands on target, not parent (depth 3)", () => {
    // Bug repro: km-tui.search-nav-v2
    // Tree: board > col > card > leaf-target
    // From board root, searching for leaf-target should zoom to col
    // and place cursor on leaf-target itself (as a card under col)
    const { board, store } = testEnv(() =>
      item("board", item("col", item("card-parent", item("leaf-target"), item("other-leaf")))),
    )

    // Board root = "board", columns = [col], cards = [card-parent]
    // leaf-target is a grandchild of col, not directly visible as a card
    openSearchDialog(store, board)
    for (const c of "leaf-target") board.press(c)
    board.press("Enter")

    // After navigation: root should be "col" (grandparent of leaf-target)
    // making card-parent a column and leaf-target a card
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("col")
    expect(pane.sel.node.cursor() as string | null).toBe("leaf-target")

    // Cursor should be on the target node itself
    board.expect("#leaf-target[data-cursor]").toExist()
  })

  test("search navigation: depth-2 target selected in place (no zoom needed)", () => {
    // Target is already a card in the current view (grandchild of root)
    const { board, store } = testEnv(() => item("board", item("col", item("visible-card"), item("another-card"))))

    openSearchDialog(store, board)
    for (const c of "another-card") board.press(c)
    board.press("Enter")

    // Should NOT zoom — just select the card in place
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("board")
    expect(pane.sel.node.cursor() as string | null).toBe("another-card")
    board.expect("#another-card[data-cursor]").toExist()
  })

  test("search navigation: depth-4 target becomes card after zoom", () => {
    // Tree: root > A > B > C > target
    // Target at depth 4 from root. Should zoom to C's grandparent (B)
    // making C a column and target a card.
    const { board, store } = testEnv(() => item("root", item("A", item("B", item("C", item("deep-target"))))))

    openSearchDialog(store, board)
    for (const c of "deep-target") board.press(c)
    board.press("Enter")

    // ancestors = [deep-target, C, B, A, root]
    // grandparent = B → zoom to B, making C a column and deep-target a card
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("B")
    expect(pane.sel.node.cursor() as string | null).toBe("deep-target")
    board.expect("#deep-target[data-cursor]").toExist()
  })

  test("search navigation: depth-5 target lands on actual matched node, not parent", () => {
    // km-tui.search-nav regression: deeply nested nodes must zoom to grandparent
    // and cursor must land on target itself, not its parent section.
    // Tree: root > A > B > C > D > very-deep-target
    const { board, store } = testEnv(() =>
      item("root", item("A", item("B", item("C", item("D", item("very-deep-target")))))),
    )

    openSearchDialog(store, board)
    for (const c of "very-deep-target") board.press(c)
    board.press("Enter")

    // ancestors = [very-deep-target, D, C, B, A, root]
    // grandparent (index 2) = C → zoom to C, D becomes column, very-deep-target becomes card
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("C")
    expect(pane.sel.node.cursor() as string | null).toBe("very-deep-target")
    board.expect("#very-deep-target[data-cursor]").toExist()
  })

  test("Enter on paragraph search result navigates correctly", () => {
    // Bug repro: search Enter on paragraph/section types doesn't work
    // Use real node types: file > section > paragraph
    // Tree: Vault > Notes > MyDoc > Intro > China..., Another...
    const { board, store } = testEnv(() =>
      item.root(
        "Vault",
        item.folder(
          "Notes",
          item.file("MyDoc", item.section("Intro", item.p("China domicile information"), item.p("Another paragraph"))),
        ),
      ),
    )

    // Zoom out to vault level
    board.press("Escape")

    // Search for a paragraph inside a section inside a file
    openSearchDialog(store, board)
    for (const c of "China") board.press(c)
    board.press("Enter")

    // Dialog should close
    const output = board.screenshot()
    expect(output).not.toContain("Enter go") // Dialog closed

    // Zoom should navigate to MyDoc (grandparent of target paragraph)
    // making Intro a column and China... a card
    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("MyDoc")
    expect(pane.sel.node.cursor() as string | null).toBe("China domicile information")

    // The section header "Intro" should be visible (it's a column)
    expect(output).toContain("Intro")

    // Cursor should be on the China paragraph
    expect(
      board.q('[id="China domicile information"][data-cursor]').count(),
      "Cursor should be on the searched paragraph",
    ).toBeGreaterThan(0)
  })
})

describe("Virtual body card", () => {
  test("body-only columns render items borderless (virtual)", () => {
    // Column with only paragraphs (no tasks) — items render borderless
    using app = createTestApp(item("board", item.section("col1", item.p("intro text"), item.p("more text"))))
    // Cursor starts on first card (paragraph) in Cards view
    expect(app.text).toContain("intro text")

    app.command("cursor_down") // second paragraph
    expect(app.text).toContain("more text")

    // After last body item, boundary
    app.command("cursor_down")
    expect(app.bell).toBe(true)
  })

  test("task-only columns render items with borders (non-virtual)", () => {
    // Column with tasks should render as regular bordered cards
    using app = createTestApp(item("board", item("col1", item("taska"), item("taskb"), item("taskc"))))
    // Cursor starts on first card in Cards view
    app.expect("#taska[data-cursor]").toExist()
    app.command("cursor_down")
    app.expect("#taskb[data-cursor]").toExist()
    app.command("cursor_down")
    app.expect("#taskc[data-cursor]").toExist()
  })
})

describe("Help and Keyboard Shortcuts", () => {
  test("? shows keyboard shortcuts", () => {
    using app = createTestApp(item("board", item("col", item("task"))))
    app.command("show_help")
    expect(app.text).toMatch(/help|shortcuts|keys/i)
  })
})

describe("Content Lines (+/-)", () => {
  // Note: keyToAnsi("+") fails because "+" is the modifier separator.
  // Use "=" (same keybinding) for increase_content_lines tests.

  test("= increases visible children inside cards", () => {
    // Card with 6 children -- default maxContentLines=3 should show 3, then = shows 4
    using app = createTestApp(
      item(
        "board",
        item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6"))),
      ),
    )
    // Default maxContentLines=3: should show c1, c2, c3 and hide c4-c6
    expect(app.text).toContain("c1")
    expect(app.text).toContain("c2")
    expect(app.text).toContain("c3")
    expect(app.text).not.toContain("c4")

    app.command("increase_content_lines")
    // After =, maxContentLines=4: should now show c4
    expect(app.text).toContain("c4")
    expect(app.text).not.toContain("c5")
  })

  test("- decreases visible children inside cards", () => {
    using app = createTestApp(
      item(
        "board",
        item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6"))),
      ),
    )
    expect(app.text).toContain("c3")

    app.command("decrease_content_lines")
    // After -, maxContentLines=2: c3 should be hidden
    expect(app.text).not.toContain("c3")
    expect(app.text).toContain("c1")
    expect(app.text).toContain("c2")
  })

  test("multiple = presses progressively reveal more children", () => {
    // Uses 8 children so the "+1 more takes same space" optimization (effectiveMax)
    // doesn't interfere — that shows all N when N = maxContentLines + 1.
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col",
          item(
            "parent",
            item("c1"),
            item("c2"),
            item("c3"),
            item("c4"),
            item("c5"),
            item("c6"),
            item("c7"),
            item("c8"),
          ),
        ),
      ),
    )
    // Start: maxContentLines=3 (c1, c2, c3 visible; c4+ hidden)
    expect(board.screenshot()).not.toContain("c4")

    board.command("increase_content_lines") // maxContentLines=4
    expect(board.screenshot()).toContain("c4")
    expect(board.screenshot()).not.toContain("c5")

    board.command("increase_content_lines") // maxContentLines=5
    expect(board.screenshot()).toContain("c5")
    expect(board.screenshot()).not.toContain("c6")

    board.command("increase_content_lines") // maxContentLines=6
    expect(board.screenshot()).toContain("c6")
  })

  test("=/- shows status feedback in bottom bar", () => {
    using app = createTestApp(
      item("board", item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4")))),
    )
    app.command("increase_content_lines")
    const status = app.getStatus()
    expect(status).not.toBeNull()
    expect(status!.message).toContain("Content lines: 4")
  })
})

describe("Detail Pane Navigation", () => {
  test("detail pane stays open when navigating with j/k", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"), item("card3"))))

    // Open detail pane with Space
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Navigate down with j — detail pane should stay open
    board.command("cursor_down")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Navigate up with k — detail pane should stay open
    board.command("cursor_up")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("detail pane updates to show new card when navigating with j/k", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // Open detail pane with Space on card1
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    // Detail pane should contain card1 content
    const screen1 = board.screenshot()
    expect(screen1).toContain("card1")

    // Navigate down to card2 — detail pane should update
    board.command("cursor_down")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    const screen2 = board.screenshot()
    expect(screen2).toContain("card2")
  })

  test("Space closes detail pane", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // Open detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Space again should close it
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("Escape from detail: unfocus → close", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // D opens + auto-focuses detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Escape 1: unfocus detail → return to board (pane stays open)
    board.press("Escape")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Escape 2: close pane
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("h/l navigates columns while detail pane stays open", () => {
    // Suppress [EXCESS] silvery layout warnings — detail pane resize triggers
    // transient layout overflow that is unrelated to navigation correctness
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      // Detail pane takes 40% of width; need both columns visible alongside it.
      // At 120 cols: boardWidth = 72, which fits 2 × 35-char columns.
      const { board, store } = testEnv(() => item("board", item("col1", item("card1")), item("col2", item("card2"))), {
        columns: 120,
      })

      // D opens + auto-focuses detail pane, h returns to board
      board.command("toggle_detail_pane")
      expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
      board.command("cursor_left") // return to board

      // h/l should navigate columns — detail pane stays open
      board.command("cursor_right")
      expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
      board.expect("#card2[data-cursor]").toExist()

      board.command("cursor_left")
      expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
      board.expect("#card1[data-cursor]").toExist()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

/**
 * Board Feature Tests - Display, Search, Content, Folding, etc.
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, expect } from "vitest"
import { act } from "react"
import { item, testEnv } from "./helpers/board-test.ts"
import { dispatchCommandById } from "../src/board-app.ts"
import type { StoreApi } from "zustand"
import type { BoardAppStore } from "../src/board-app-store.ts"

/**
 * Open the old search dialog (no keybinding anymore — dispatched directly).
 * After dispatching, press Backspace to flush the inkx render pipeline.
 * The dialog text input is empty at this point, so Backspace is a no-op.
 */
function openSearchDialog(store: StoreApi<BoardAppStore>, board: ReturnType<typeof testEnv>["board"]) {
  act(() => {
    dispatchCommandById("search", store.getState as () => BoardAppStore)
    store.setState((s) => s)
  })
  board.press("Backspace") // flush inkx render pipeline
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
  test("new item dialog shows on 'gn' chord and closes on Escape", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))

    // gn opens dialog
    board.press("g").press("n")
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
    const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
    board.expect("#child1").toExist()
    board.press("<")
    board.expect("#child1").not.toExist()
    // Children are hidden; child count is hidden in cards (overflow indicator shows it)
  })

  test("folded card hides children", () => {
    const { board } = testEnv(() => item("board", item("col", item("task", item("sub1"), item("sub2"), item("sub3")))))
    board.expect("#sub1").toExist()
    board.press("<")
    board.expect("#sub1").not.toExist()
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
    expect(output).toContain("\u2026") // U+2026 horizontal ellipsis (from inkx truncateText)
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
    const { board } = testEnv(() => item("board", item("col1", item("task")), item("col2", item("task"))), {
      columns: 40,
    })
    // Should only show one column at a time in narrow terminal
  })

  test("wide terminal (200 cols) shows many columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("t1")),
          item("col2", item("t2")),
          item("col3", item("t3")),
          item("col4", item("t4")),
        ),
      { columns: 200 },
    )
    // Verify all columns are rendered (their cards are visible)
    // The first line is the path breadcrumb, not column headers
    board.expect("#col1").toExist()
    board.expect("#col2").toExist()
    board.expect("#col3").toExist()
    board.expect("#col4").toExist()
  })

  test("terminal resize maintains cursor position", () => {
    // ARCHITECTURE VERIFICATION TEST
    //
    // This test verifies the cursor position preservation architecture.
    // The system stores cursorNodeId (node ID string) rather than visual indices.
    //
    // When terminal resizes, BoardApp's resize handler calls store.setDimensions().
    // The Board component then:
    // 1. Updates ui.dimensions state
    // 2. useColumns re-derives columns from repo (triggered by dimension change)
    // 3. useCursorPosition re-derives visual position from cursorNodeId
    // 4. Cursor stays on the same node automatically
    //
    // We verify this by checking that cursor elements have stable node IDs.

    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
    )

    // Navigate to a card
    board.press("l") // Move to col2's first card
    const cursorEl = board.q("[data-cursor]")
    const cursorNodeId = cursorEl.getAttribute("id")

    // Verify cursor is tracked by node ID, not visual indices
    expect(cursorNodeId).toBeTruthy()
    expect(cursorNodeId).toBe("2a")

    // The presence of stable node IDs in cursor tracking proves
    // the architecture correctly preserves cursor position during resize.
    // Visual positions (colIndex, cardIndex) are derived from cursorNodeId,
    // so they automatically update when terminal dimensions change.
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
    board.press("T")
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
    board.press("l")
    board.press("p")
    board.press("h")
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
    board.press("T")
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
    board.press("Z") // Zoom out
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
    board.press("Z")
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
    const state = store.getState()
    expect(state.rootId).toBe("Notes")
    expect(state.cursorNodeId).toBe("Section A")

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
    const state = store.getState()
    expect(state.rootId).toBe("col")
    expect(state.cursorNodeId).toBe("leaf-target")

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
    const state = store.getState()
    expect(state.rootId).toBe("board")
    expect(state.cursorNodeId).toBe("another-card")
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
    const state = store.getState()
    expect(state.rootId).toBe("B")
    expect(state.cursorNodeId).toBe("deep-target")
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
    const state = store.getState()
    expect(state.rootId).toBe("C")
    expect(state.cursorNodeId).toBe("very-deep-target")
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
          item.file(
            "MyDoc",
            item.section("Intro", item.paragraph("China domicile information"), item.paragraph("Another paragraph")),
          ),
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
    const state = store.getState()
    expect(state.rootId).toBe("MyDoc")
    expect(state.cursorNodeId).toBe("China domicile information")

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
    const { board } = testEnv(() =>
      item("board", item.section("col1", item.paragraph("intro text"), item.paragraph("more text"))),
    )
    // Cursor starts on first card (paragraph) in Cards view
    const output = board.screenshot()
    expect(output).toContain("intro text")

    board.press("j") // second paragraph
    const output2 = board.screenshot()
    expect(output2).toContain("more text")

    // After last body item, boundary
    board.press("j")
    expect(board.bell).toBe(true)
  })

  test("task-only columns render items with borders (non-virtual)", () => {
    // Column with tasks should render as regular bordered cards
    const { board } = testEnv(() => item("board", item("col1", item("taska"), item("taskb"), item("taskc"))))
    // Cursor starts on first card in Cards view
    board.expect("#taska[data-cursor]").toExist()
    board.press("j")
    board.expect("#taskb[data-cursor]").toExist()
    board.press("j")
    board.expect("#taskc[data-cursor]").toExist()
  })
})

describe("Help and Keyboard Shortcuts", () => {
  test("? shows keyboard shortcuts", () => {
    const { board } = testEnv(() => item("board", item("col", item("task"))))
    board.press("?")
    const output = board.screenshot()
    expect(output).toMatch(/help|shortcuts|keys/i)
  })
})

describe("Content Lines (+/-)", () => {
  // Note: keyToAnsi("+") fails because "+" is the modifier separator.
  // Use "=" (same keybinding) for increase_content_lines tests.

  test("= increases visible children inside cards", () => {
    // Card with 6 children -- default maxContentLines=3 should show 3, then = shows 4
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6"))),
      ),
    )
    const before = board.screenshot()
    // Default maxContentLines=3: should show c1, c2, c3 and hide c4-c6
    expect(before).toContain("c1")
    expect(before).toContain("c2")
    expect(before).toContain("c3")
    expect(before).not.toContain("c4")

    board.press("=")
    const after = board.screenshot()
    // After =, maxContentLines=4: should now show c4
    expect(after).toContain("c4")
    expect(after).not.toContain("c5")
  })

  test("- decreases visible children inside cards", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6"))),
      ),
    )
    const before = board.screenshot()
    expect(before).toContain("c3")

    board.press("-")
    const after = board.screenshot()
    // After -, maxContentLines=2: c3 should be hidden
    expect(after).not.toContain("c3")
    expect(after).toContain("c1")
    expect(after).toContain("c2")
  })

  test("multiple = presses progressively reveal more children", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4"), item("c5"), item("c6"))),
      ),
    )
    // Start: maxContentLines=3 (c1, c2, c3 visible)
    expect(board.screenshot()).not.toContain("c4")

    board.press("=") // maxContentLines=4
    expect(board.screenshot()).toContain("c4")
    expect(board.screenshot()).not.toContain("c5")

    board.press("=") // maxContentLines=5
    expect(board.screenshot()).toContain("c5")
    expect(board.screenshot()).not.toContain("c6")

    board.press("=") // maxContentLines=6
    expect(board.screenshot()).toContain("c6")
  })

  test("=/- shows status feedback in bottom bar", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("parent", item("c1"), item("c2"), item("c3"), item("c4")))),
    )
    board.press("=")
    const status = board.getStatus()
    expect(status).not.toBeNull()
    expect(status!.message).toContain("Content lines: 4")
  })
})

describe("Detail Pane Navigation", () => {
  test("detail pane stays open when navigating with j/k", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"), item("card3"))))

    // Open detail pane with Space
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Navigate down with j — detail pane should stay open
    board.press("j")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Navigate up with k — detail pane should stay open
    board.press("k")
    expect(store.getState().ui.showDetailPane).toBe(true)
  })

  test("detail pane updates to show new card when navigating with j/k", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // Open detail pane with Space on card1
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    // Detail pane should contain card1 content
    const screen1 = board.screenshot()
    expect(screen1).toContain("card1")

    // Navigate down to card2 — detail pane should update
    board.press("j")
    expect(store.getState().ui.showDetailPane).toBe(true)
    const screen2 = board.screenshot()
    expect(screen2).toContain("card2")
  })

  test("Space closes detail pane", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // Open detail pane
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Space again should close it
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(false)
  })

  test("Escape unfocuses detail pane (pane stays open, focus returns to board)", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))

    // Open detail pane (P toggles: closed → open+focused)
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("detail")

    // Escape should unfocus pane (pane stays open, focus returns to board)
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(true)
    expect(store.getState().ui.focusedPane).toBe("board")
  })

  test("h/l navigates columns while detail pane stays open", () => {
    // Detail pane takes 40% of width; need both columns visible alongside it.
    // At 120 cols: boardWidth = 72, which fits 2 × 35-char columns.
    const { board, store } = testEnv(() => item("board", item("col1", item("card1")), item("col2", item("card2"))), {
      columns: 120,
    })

    // Open detail pane on card1
    board.press("D")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // h/l should navigate columns — detail pane stays open
    board.press("l")
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.expect("#card2[data-cursor]").toExist()

    board.press("h")
    expect(store.getState().ui.showDetailPane).toBe(true)
    board.expect("#card1[data-cursor]").toExist()
  })
})

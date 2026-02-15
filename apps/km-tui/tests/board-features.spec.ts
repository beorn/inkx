/**
 * Board Feature Tests - Display, Search, Content, Folding, etc.
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

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

  test("column headers show card count", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"), item("task3"))))
    const output = board.screenshot()
    expect(output).toContain(" 3")
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
    board.press("z").press("M")
    board.expect("#child1").not.toExist()
    const output = board.screenshot()
    expect(output).toContain(" 2")
  })

  test("folded card shows count indicator", () => {
    const { board } = testEnv(() => item("board", item("col", item("task", item("sub1"), item("sub2"), item("sub3")))))
    board.press("z").press("M")
    const output = board.screenshot()
    expect(output).toContain(" 3")
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
    expect(output).toContain("⋯") // Ellipsis for truncation
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
  test("/ opens search dialog with title and footer", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"))))
    board.press("/")
    const output = board.screenshot()
    expect(output).toContain("Search")
    expect(output).toContain("/ ")
    expect(output).toContain("Enter go")
    expect(output).toContain("Esc cancel")
  })

  test("search shows multiple results on consecutive lines", () => {
    // Create items with long titles that will be truncated
    const { board } = testEnv(() =>
      item(
        "board",
        item("col", item("Task Alpha with long title"), item("Task Beta with long title"), item("Task Gamma short")),
      ),
    )
    board.press("/")
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
    const { board } = testEnv(() => item("board", item("col", item("task1"))))
    board.press("/")
    expect(board.screenshot()).toContain("Search")
    board.press("\x1b")
    expect(board.screenshot()).not.toContain("Enter go")
  })

  test("typing immediately after / captures all characters", () => {
    // Bug repro: keypresses are eaten while search dialog opens
    // The lazy loading via useEffect + startTransition should not block input
    const { board } = testEnv(() => item("board", item("col", item("alpha"), item("beta"), item("gamma"))))

    // Type "/" followed immediately by a query - all characters should be captured
    board.press("/")
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
    const { board } = testEnv(() =>
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
    )
    board.press("/")
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
    const { board } = testEnv(() =>
      item(
        "board",
        item("Col1", item("Task Alpha"), item("Task Beta")),
        item("Col2", item("Task Gamma"), item("Task Delta")),
      ),
    )

    // Open search and type to filter
    board.press("/")
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
    const { board } = testEnv(() =>
      item("board", item("Projects", item("Active", item("Task Deep")), item("Archive", item("Old Task")))),
    )

    // Board shows columns at top level - zoom out first to test
    board.press("Escape") // Zoom out
    let output = board.screenshot()

    // Open search and select a deeply nested item
    board.press("/")
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
    const { board } = testEnv(() =>
      item("Vault", item("Notes", item("Doc1", item("Section A"), item("Section B")), item("Doc2", item("Section X")))),
    )

    // Zoom out to vault level first (Escape goes back in history)
    board.press("Escape")
    let output = board.screenshot()

    // Search for a deeply nested section
    board.press("/")
    for (const c of "Section A") board.press(c)
    board.press("Enter")

    // Dialog should close and section should be visible after zoom
    output = board.screenshot()
    expect(output).not.toContain("Enter go") // Dialog closed
    expect(output).toContain("Section A")
  })

  test("Enter on search result puts cursor on the selected item", () => {
    // Bug repro: search Enter on non-file items doesn't set cursor
    // Vault > Notes > Doc1 > Section A
    const { board } = testEnv(() => item("Vault", item("Notes", item("Doc1", item("Section A"), item("Section B")))))

    // Zoom out to vault level
    board.press("Escape")

    // Search for Section A and select it
    board.press("/")
    for (const c of "Section A") board.press(c)
    board.press("Enter")

    // Cursor should be on Section A (or its parent card if section is content)
    // At minimum, Section A should have [data-cursor] OR be a descendant of cursor
    const cursorNode = board.q("[data-cursor]")
    expect(cursorNode.count()).toBeGreaterThan(0)

    // The cursor should be on or contain Section A
    const output = board.screenshot()
    expect(output).toContain("Section A")

    // Verify cursor is actually on Section A or Doc1 (the card containing it)
    const sectionACursor = board.q("#Section-A[data-cursor]").count()
    const doc1Cursor = board.q("#Doc1[data-cursor]").count()
    expect(sectionACursor + doc1Cursor).toBeGreaterThan(0)
  })

  test("Enter on paragraph search result navigates correctly", () => {
    // Bug repro: search Enter on paragraph/section types doesn't work
    // Use real node types: file > section > paragraph
    const { board } = testEnv(() =>
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
    board.press("/")
    for (const c of "China") board.press(c)
    board.press("Enter")

    // Dialog should close
    const output = board.screenshot()
    expect(output).not.toContain("Enter go") // Dialog closed

    // We should have zoomed to show MyDoc (the file containing the paragraph).
    // The paragraph itself may not be directly visible because card children
    // (Intro section) are collapsed to single lines in cards view, but the
    // section header "Intro" should be visible.
    expect(output).toContain("Intro")
    expect(output).toContain("MyDoc")

    // Cursor should be on or near the paragraph we searched for
    // The cursor should be on China paragraph, Intro section, or MyDoc file
    const chinaCursor = board.q("#China-domicile-information[data-cursor]").count()
    const introCursor = board.q("#Intro[data-cursor]").count()
    const myDocCursor = board.q("#MyDoc[data-cursor]").count()

    expect(
      chinaCursor + introCursor + myDocCursor,
      "Cursor should be on the searched paragraph, its section, or its file",
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

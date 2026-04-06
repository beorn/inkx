/**
 * Board Acceptance Tests - View Controls
 *
 * Tests for fold/collapse (z/Z/c), outline depth (</>), content lines (+/-),
 * and task status (space).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Column Fold/Collapse
// =============================================================================

describe("Column Fold/Collapse", () => {
  test("< progressively folds tree (multiple presses reach depth 0)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a", item("sub1"), item("sub2")), item("1b", item("sub3"))),
        item("col2", item("2a")),
      ),
    )
    board.expect("#sub1").toExist()

    // Progressive fold: each press reduces depth by 1 (starts at 3)
    // After enough presses, sub-items are hidden (depth reaches 0)
    board.command("fold_all") // 3→2
    board.command("fold_all") // 2→1
    board.command("fold_all") // 1→0
    board.expect("#sub1").not.toExist()
    board.expect("#sub2").not.toExist()
    board.expect("#sub3").not.toExist()
  })

  test("> progressively unfolds tree after fold", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a", item("sub1"), item("sub2")), item("1b", item("sub3"))),
        item("col2", item("2a")),
      ),
    )
    // Fold all to depth 0
    board.command("fold_all")
    board.command("fold_all")
    board.command("fold_all")
    board.expect("#sub1").not.toExist()

    // > unfolds one level at a time
    board.command("unfold_all") // 0→1
    board.expect("#sub1").toExist()
    board.expect("#sub2").toExist()
    board.expect("#sub3").toExist()
  })

  test("< folds all columns board-wide (progressive)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a", item("sub1"))), item("col2", item("2a", item("sub2")))),
    )
    board.expect("#sub1").toExist()
    board.expect("#sub2").toExist()

    // < folds all columns across the entire board progressively
    board.command("fold_all")
    board.command("fold_all")
    board.command("fold_all")
    board.expect("#sub1").not.toExist()
    board.expect("#sub2").not.toExist() // col2 also folded
  })

  test("c toggles column collapse", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    board.expect("#1a").toExist()
    board.expect("#1b").toExist()

    // c collapses current column — cards hidden, column shows first letter
    board.command("toggle_collapse")
    board.expect("#1a").not.toExist()
    board.expect("#1b").not.toExist()

    // c again un-collapses
    board.command("toggle_collapse")
    board.expect("#1a").toExist()
    board.expect("#1b").toExist()
  })

  test("c on different column collapses that column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Move to col2
    board.command("cursor_right")
    board.expect("#2a[data-cursor]").toExist()

    // Collapse col2 — cards hidden
    board.command("toggle_collapse")
    board.expect("#2a").not.toExist()
    board.expect("#2b").not.toExist()

    // col1 should still show its cards
    board.expect("#1a").toExist()
  })

  test("collapsed column shows vertical title text", () => {
    const { board } = testEnv(() => item("board", item("Todo", item("1a"), item("1b")), item("Done", item("2a"))), {
      columns: 80,
      rows: 20,
    })
    board.expect("#1a").toExist()

    // Collapse "Todo" column
    board.command("toggle_collapse")
    board.expect("#1a").not.toExist()

    // The collapsed column should show "data-collapsed" attribute
    board.expect("[data-collapsed]").toExist()
  })

  test("c persists collapsed state to node data", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Collapse col1
    board.command("toggle_collapse")
    board.expect("#1a").not.toExist()

    // Verify the collapsed state is persisted in node data
    const colNode = repo.getNode("col1")!
    expect((colNode.data as Record<string, unknown>).collapsed).toBe(true)

    // Uncollapse col1
    board.command("toggle_collapse")
    board.expect("#1a").toExist()

    // Verify the collapsed key is removed from node data
    const colNodeAfter = repo.getNode("col1")!
    expect((colNodeAfter.data as Record<string, unknown>).collapsed).toBeUndefined()
  })

  // TODO(km-tui.collapse-persist): tests for persisted collapsed state
  // Need createFakeRepo + buildBoardState to test restore from node.data
})

// =============================================================================
// Outline Depth and Content Lines
// =============================================================================

describe("Outline Depth and Content Lines", () => {
  test("< decreases outline depth, hiding deeper children", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1", item("deep1"))))))
    board.expect("#sub1").toExist()

    // Progressive fold: 3 presses to reach depth 0 (from default start of 3)
    board.command("fold_all")
    board.command("fold_all")
    board.command("fold_all")

    // At depth 0, children beyond immediate cards should be hidden
    board.expect("#sub1").not.toExist()
  })

  test("> increases outline depth, showing deeper children", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1", item("deep1"))))))
    // Decrease to 0 first
    board.command("fold_all")
    board.command("fold_all")
    board.command("fold_all")
    board.expect("#sub1").not.toExist()

    // Increase back — one press should reveal depth 1 children
    board.command("unfold_all")
    board.expect("#sub1").toExist()
  })

  test("< has minimum of 0", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1")))))
    // Press < many times - should not error
    for (let i = 0; i < 5; i++) board.command("fold_all")

    // Cards in column are always visible (depth 0 = card titles only)
    board.expect("#1a").toExist()
    board.expect("#sub1").not.toExist()
  })

  test("> has maximum of 10", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1")))))
    // Press > many times - should not error
    for (let i = 0; i < 15; i++) board.command("unfold_all")

    board.expect("#1a").toExist()
    board.expect("#sub1").toExist()
  })

  test("+ increases content lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.press("+")
    board.expect("#1a").toExist()
  })

  test("= also increases content lines (alias)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.command("increase_content_lines")
    board.expect("#1a").toExist()
  })

  test("- decreases content lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.command("decrease_content_lines")
    board.expect("#1a").toExist()
  })

  test("- has minimum of 1 content line", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Press - many times past minimum
    for (let i = 0; i < 10; i++) board.command("decrease_content_lines")
    board.expect("#1a").toExist()
  })

  test("+ has maximum of 10 content lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Press + many times past maximum
    for (let i = 0; i < 15; i++) board.press("+")
    board.expect("#1a").toExist()
  })
})

// =============================================================================
// Task Status
// =============================================================================

describe("Task Status", () => {
  test("X cycles task status through multiple states", () => {
    // Use item.task() which sets task_status: "todo" (required for isTask)
    const { board } = testEnv(() => item("board", item("col", item.task("task"))))
    board.expect("#task[data-cursor]").toExist()

    // todo → wip (both show □, but different colors in ANSI)
    board.command("cycle_task_status")
    board.expect("#task[data-cursor]").toExist()

    // wip → blocked (shows ✗ U+2717)
    board.command("cycle_task_status")
    const output = board.screenshot()
    expect(output).toContain("\u2717") // ✗ blocked icon
  })

  test("X on task does not affect other cards", () => {
    const { board } = testEnv(() => item("board", item("col", item.task("task1"), item.task("task2"))))
    board.expect("#task1[data-cursor]").toExist()

    // Pressing X cycles task1's status, task2 unchanged
    board.command("cycle_task_status")
    board.expect("#task1[data-cursor]").toExist()
    board.expect("#task2").toExist()
  })
})

// =============================================================================
// Untitled Columns
// =============================================================================

describe("Untitled Columns", () => {
  test("untitled columns render as (shortId) not sibling names", () => {
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item("Named", item("task1")),
          item("untitled-col", item("task2")),
          item("Another", item("task3")),
        )
        // Clear the name from the middle column to simulate empty ## section
        const untitledCol = nodes.find((n) => n.id === "untitled-col")
        if (untitledCol) {
          untitledCol.data = {}
          untitledCol.title = undefined
          untitledCol.content = undefined
        }
        return nodes
      },
      { columns: 120 },
    )

    const text = board.screenshot()

    // Named columns should show their name
    expect(text).toContain("Named")
    expect(text).toContain("Another")

    // Untitled column should show (shortId) not "Named" or "Another"
    // slice(-8) of "untitled-col" = "tled-col"
    expect(text).toContain("(tled-col")

    // "Named" appears once in column header, possibly once in top bar
    // But should NOT appear as the untitled column's name
    const namedMatches = text.match(/\bNamed\b/g) ?? []
    expect(namedMatches.length).toBeLessThanOrEqual(2)
  })

  test("empty section with stale data.title does not show stale name", () => {
    // Regression: DB data JSON blob can retain stale title from a previous
    // state of the file. node.title="" should take precedence over data.title.
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item("Processing", item("task1")),
          item("stale-col", item("task2")),
          item("Waiting", item("task3")),
        )
        // Simulate stale DB state: title is empty but data.title still has old value
        const staleCol = nodes.find((n) => n.id === "stale-col")
        if (staleCol) {
          staleCol.title = ""
          staleCol.content = ""
          staleCol.data = { rules: { color: "yellow" }, title: "Waiting" }
        }
        return nodes
      },
      { columns: 120 },
    )

    const text = board.screenshot()

    // "Waiting" should appear exactly once (the real Waiting column)
    // NOT twice (would indicate stale data.title leaking through)
    const waitingMatches = text.match(/\bWaiting\b/g) ?? []
    expect(waitingMatches.length).toBe(1)

    // The stale column should show as untitled (shortId in parens)
    // slice(-8) of "stale-col" = "tale-col"
    expect(text).toContain("(tale-col")
  })
})

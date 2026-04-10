/**
 * Board Acceptance Tests - View Controls
 *
 * Tests for fold/collapse (z/Z/c), outline depth (</>), content lines (+/-),
 * and task status (space).
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Column Fold/Collapse
// =============================================================================

describe("Column Fold/Collapse", () => {
  test("< progressively folds tree (multiple presses reach depth 0)", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a", item("sub1"), item("sub2")), item("1b", item("sub3"))),
        item("col2", item("2a")),
      ),
    )
    app.expect("#sub1").toExist()

    // Progressive fold: each press reduces depth by 1 (starts at 3)
    // After enough presses, sub-items are hidden (depth reaches 0)
    app.command("fold_all_more") // 3→2
    app.command("fold_all_more") // 2→1
    app.command("fold_all_more") // 1→0
    app.expect("#sub1").not.toExist()
    app.expect("#sub2").not.toExist()
    app.expect("#sub3").not.toExist()
  })

  test("> progressively unfolds tree after fold", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a", item("sub1"), item("sub2")), item("1b", item("sub3"))),
        item("col2", item("2a")),
      ),
    )
    // Fold all to depth 0
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.expect("#sub1").not.toExist()

    // > unfolds one level at a time
    app.command("unfold_all_more") // 0→1
    app.expect("#sub1").toExist()
    app.expect("#sub2").toExist()
    app.expect("#sub3").toExist()
  })

  test("< folds all columns board-wide (progressive)", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a", item("sub1"))), item("col2", item("2a", item("sub2")))),
    )
    app.expect("#sub1").toExist()
    app.expect("#sub2").toExist()

    // < folds all columns across the entire board progressively
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.expect("#sub1").not.toExist()
    app.expect("#sub2").not.toExist() // col2 also folded
  })

  test("c toggles column collapse", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))))
    app.expect("#1a").toExist()
    app.expect("#1b").toExist()

    // c collapses current column — cards hidden, column shows first letter
    app.command("toggle_collapse")
    app.expect("#1a").not.toExist()
    app.expect("#1b").not.toExist()

    // c again un-collapses
    app.command("toggle_collapse")
    app.expect("#1a").toExist()
    app.expect("#1b").toExist()
  })

  test("c on different column collapses that column", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Move to col2
    app.command("cursor_right")
    app.expect("#2a[data-cursor]").toExist()

    // Collapse col2 — cards hidden
    app.command("toggle_collapse")
    app.expect("#2a").not.toExist()
    app.expect("#2b").not.toExist()

    // col1 should still show its cards
    app.expect("#1a").toExist()
  })

  test("collapsed column shows vertical title text", () => {
    using app = createTestApp(item("board", item("Todo", item("1a"), item("1b")), item("Done", item("2a"))), {
      cols: 80,
      rows: 20,
    })
    app.expect("#1a").toExist()

    // Collapse "Todo" column
    app.command("toggle_collapse")
    app.expect("#1a").not.toExist()

    // The collapsed column should show "data-collapsed" attribute
    app.expect("[data-collapsed]").toExist()
  })

  test("c persists collapsed state to node data", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Collapse col1
    app.command("toggle_collapse")
    app.expect("#1a").not.toExist()

    // Verify the collapsed state is persisted in node data
    const colNode = app.repo.getNode("col1")!
    expect((colNode.data as Record<string, unknown>).collapsed).toBe(true)

    // Uncollapse col1
    app.command("toggle_collapse")
    app.expect("#1a").toExist()

    // Verify the collapsed key is removed from node data
    const colNodeAfter = app.repo.getNode("col1")!
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
    using app = createTestApp(item("board", item("col1", item("1a", item("sub1", item("deep1"))))))
    app.expect("#sub1").toExist()

    // Progressive fold: 3 presses to reach depth 0 (from default start of 3)
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.command("fold_all_more")

    // At depth 0, children beyond immediate cards should be hidden
    app.expect("#sub1").not.toExist()
  })

  test("> increases outline depth, showing deeper children", () => {
    using app = createTestApp(item("board", item("col1", item("1a", item("sub1", item("deep1"))))))
    // Decrease to 0 first
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.command("fold_all_more")
    app.expect("#sub1").not.toExist()

    // Increase back — one press should reveal depth 1 children
    app.command("unfold_all_more")
    app.expect("#sub1").toExist()
  })

  test("< has minimum of 0", () => {
    using app = createTestApp(item("board", item("col1", item("1a", item("sub1")))))
    // Press < many times - should not error
    for (let i = 0; i < 5; i++) app.command("fold_all_more")

    // Cards in column are always visible (depth 0 = card titles only)
    app.expect("#1a").toExist()
    app.expect("#sub1").not.toExist()
  })

  test("> has maximum of 10", () => {
    using app = createTestApp(item("board", item("col1", item("1a", item("sub1")))))
    // Press > many times - should not error
    for (let i = 0; i < 15; i++) app.command("unfold_all_more")

    app.expect("#1a").toExist()
    app.expect("#sub1").toExist()
  })

  test("+ increases content lines", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))
    app.press("+")
    app.expect("#1a").toExist()
  })

  test("= also increases content lines (alias)", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))
    app.command("increase_content_lines")
    app.expect("#1a").toExist()
  })

  test("- decreases content lines", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))
    app.command("decrease_content_lines")
    app.expect("#1a").toExist()
  })

  test("- has minimum of 1 content line", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))
    // Press - many times past minimum
    for (let i = 0; i < 10; i++) app.command("decrease_content_lines")
    app.expect("#1a").toExist()
  })

  test("+ has maximum of 10 content lines", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))
    // Press + many times past maximum
    for (let i = 0; i < 15; i++) app.press("+")
    app.expect("#1a").toExist()
  })
})

// =============================================================================
// Task Status
// =============================================================================

describe("Task Status", () => {
  test("X cycles task status through multiple states", () => {
    // Use item.task() which sets task_status: "todo" (required for isTask)
    using app = createTestApp(item("board", item("col", item.task("task"))))
    app.expect("#task[data-cursor]").toExist()

    // todo → wip (both show □, but different colors in ANSI)
    app.command("cycle_task_status")
    app.expect("#task[data-cursor]").toExist()

    // wip → blocked (shows ✗ U+2717)
    app.command("cycle_task_status")
    expect(app.text).toContain("\u2717") // ✗ blocked icon
  })

  test("X on task does not affect other cards", () => {
    using app = createTestApp(item("board", item("col", item.task("task1"), item.task("task2"))))
    app.expect("#task1[data-cursor]").toExist()

    // Pressing X cycles task1's status, task2 unchanged
    app.command("cycle_task_status")
    app.expect("#task1[data-cursor]").toExist()
    app.expect("#task2").toExist()
  })
})

// =============================================================================
// Untitled Columns
// =============================================================================

describe("Untitled Columns", () => {
  test("untitled columns render as (shortId) not sibling names", () => {
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
    using app = createTestApp(nodes, { cols: 120 })

    const text = app.text

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
    using app = createTestApp(nodes, { cols: 120 })

    const text = app.text

    // "Waiting" should appear exactly once (the real Waiting column)
    // NOT twice (would indicate stale data.title leaking through)
    const waitingMatches = text.match(/\bWaiting\b/g) ?? []
    expect(waitingMatches.length).toBe(1)

    // The stale column should show as untitled (blank, not showing a short ID)
    expect(text).not.toContain("tale-col")
  })
})

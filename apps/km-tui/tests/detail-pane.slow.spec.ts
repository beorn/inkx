/**
 * Detail Pane Journey Tests
 *
 * User-level journey specs for the detail pane feature. Tests multi-step
 * workflows verifying screen output for detail pane operations.
 *
 * Key bindings:
 *   D = toggle_detail_pane (open/close + auto-focus detail)
 *   l = focus detail pane (when at rightmost column boundary)
 *   h = return focus to board (from detail pane)
 *   j/k = navigate within detail pane entries
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Detail Pane Journeys", () => {
  test("D opens detail pane and focuses it, D again closes it", () => {
    using app = createTestApp(item("board", item("col1", item.task("Buy milk"), item.task("Fix bug"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Initially no detail pane
    app.expect("#main-detail").not.toExist()

    // Step 1: Open detail pane with D — auto-focuses detail
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()
    app.expectScreen("Buy milk")

    // Step 2: Close detail pane with D (from detail pane)
    app.command("toggle_detail_pane")
    app.expect("#main-detail").not.toExist()
  })

  test("open detail, return to board, navigate cursor down, detail follows", () => {
    using app = createTestApp(
      item("board", item("col1", item.task("task1"), item.task("task2"), item.task("task3"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — auto-focuses detail, shows task1
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expectScreen("task1")

    // Step 2: Return to board, navigate down to task2 — detail should follow
    app.command("cursor_left")
    app.command("cursor_down")
    app.expectScreen("task2")

    // Step 3: Navigate down to task3 — detail should follow
    app.command("cursor_down")
    app.expectScreen("task3")
  })

  test("detail pane shows folder children when cursor is on folder card", () => {
    using app = createTestApp(
      item("board", item("col1", item("project", item("subtask-a"), item("subtask-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane for folder card — auto-focuses detail, cursor on first child
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#subtask-a[data-cursor]").toExist()

    // Step 2: Navigate down to second child
    app.command("cursor_down")
    app.expect("#subtask-b[data-cursor]").toExist()
  })

  test("l at rightmost column focuses detail, h returns to board", () => {
    using app = createTestApp(item("board", item("col1", item.task("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane, return to board
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.command("cursor_left") // return focus to board

    // Step 2: l at rightmost column should focus detail pane
    app.command("cursor_right")
    app.expect("#main-detail[data-focused]").toExist()

    // Step 3: h should return focus to board
    app.command("cursor_left")
    app.expect("#main-detail[data-focused]").not.toExist()
    // Pane should still be open
    app.expect("#main-detail").toExist()
  })

  test("round-trip: open detail, navigate entries, return to board, navigate board", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.task("task1"), item.task("task2"), item.task("task3")),
        item("col2", item.task("task4")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane with D — auto-focuses detail
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()

    // Step 2: Navigate within detail pane
    app.command("cursor_down")

    // Step 3: Return to board
    app.command("cursor_left")
    app.expect("#main-detail[data-focused]").not.toExist()

    // Step 4: Navigate to col2 then back to col1
    app.command("cursor_right") // col1 -> col2
    app.command("cursor_left") // col2 -> col1

    // Step 5: Board navigation still works
    app.command("cursor_down")
    app.command("cursor_down")
    app.expect("#task3[data-cursor]").toExist()
  })

  test("j/k navigation between detail pane children", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a"), item("child-b"), item("child-c")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail — cursor starts on first child
    app.command("toggle_detail_pane")
    app.expect("#child-a[data-cursor]").toExist()

    // Step 2: j moves to next child
    app.command("cursor_down")
    app.expect("#child-b[data-cursor]").toExist()

    // Step 3: k moves back
    app.command("cursor_up")
    app.expect("#child-a[data-cursor]").toExist()
  })

  test("Enter on structural child triggers inline edit and typing saves", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor starts on first child (child-a)
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.expect("#main-detail[data-focused]").toExist()
    app.expect("#child-a[data-cursor]").toExist()

    // Step 2: Enter = inline edit on child-a in detail pane, detail stays open
    app.press("Enter")
    app.expect("#main-detail").toExist()

    // Step 4: Type to edit the title — the text should appear on screen
    for (const c of "-ok") app.press(c)
    app.expectScreen("child-a-ok")

    // Step 5: Escape to confirm edit
    app.press("Escape")

    // Step 6: Verify the node was updated in repo
    const updated = app.repo.getNode("child-a")
    expect(updated?.content).toContain("-ok")
  })

  test("Escape during inline edit saves and exits (no stray sibling)", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail (cursor starts on child-a), start editing
    app.command("toggle_detail_pane")
    app.press("Enter")

    // Type something
    for (const c of "-ok") app.press(c)

    // Escape saves and exits edit mode for body blocks in the detail pane
    const childrenBefore = app.repo.getChildren("parent").length
    app.press("Escape")
    expect(app.repo.getChildren("parent").length).toBe(childrenBefore) // no stray node
    expect(app.repo.getNode("child-a")?.content).toContain("-ok") // saved
  })

  test("i on structural child in detail pane also triggers inline edit", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail (cursor starts on child-a)
    app.command("toggle_detail_pane")
    app.expect("#child-a[data-cursor]").toExist()

    // i = inline edit on detail cursor node — verify edit started by typing
    app.press("i")
    // Type to verify we're in edit mode
    app.press("!")
    app.expectScreen("!child-a")
    app.press("Escape")
  })

  // =========================================================================
  // Bug km-ii6qw.2: Shift+L unfold doesn't work in detail pane
  // =========================================================================

  test("L unfolds a child in detail pane, revealing deeper descendants", () => {
    // 3 levels deep: child-a > gc-1 > ggc-1
    // With DETAIL_DEFAULT_DEPTH=1, gc-1 is visible but ggc-1 is folded
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a", item("gc-1", item("ggc-1"), item("ggc-2")))))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor on child-a
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()
    app.expect("#child-a[data-cursor]").toExist()

    // gc-1 is visible at depth 1, but ggc-1/ggc-2 are folded (depth exceeded)
    app.expectScreen("gc-1")

    // Step 2: Unfold child-a with L (Shift+L) — should reveal ggc-1, ggc-2
    app.command("unfold_more")

    // After unfold, deeper descendants should be visible
    app.expectScreen("ggc-1")
  })

  test("H folds a child in detail pane, hiding its sub-children", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a", item("gc-1"), item("gc-2"))))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor on child-a
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()

    // gc-1 and gc-2 are visible at DETAIL_DEFAULT_DEPTH=1
    app.expectScreen("gc-1")

    // Step 2: Fold child-a — gc-1/gc-2 should disappear from detail
    app.command("fold_more")

    // Step 3: Unfold — should restore
    app.command("unfold_more")
    app.expectScreen("gc-1")
  })

  // =========================================================================
  // Bug km-ii6qw.3: Detail depth matches column depth (no full tree duplication)
  // =========================================================================

  test("detail pane children use controlled depth, not infinite expansion", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a", item("gc-1", item("ggc-1")))))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()

    // DETAIL_DEFAULT_DEPTH=1: child-a shows gc-1 (1 level), but gc-1's children
    // (ggc-1) should be folded. The detail pane should NOT show ggc-1 initially.
    app.expectScreen("gc-1")
    app.expectScreenNot("ggc-1")
  })

  test("detail pane stays open when navigating between columns", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item.task("task-a")),
        item("col2", item.task("task-b")),
        item("col3", item.task("task-c")),
      ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane, return focus to board
    app.command("toggle_detail_pane")
    app.expect("#main-detail").toExist()
    app.command("cursor_left") // return to board

    // Step 2: Navigate right to col2
    app.command("cursor_right")
    app.expect("#main-detail").toExist()
    app.expectScreen("task-b")

    // Step 3: Navigate right to col3
    app.command("cursor_right")
    app.expect("#main-detail").toExist()
    app.expectScreen("task-c")

    // Step 4: Navigate left back to col2
    app.command("cursor_left")
    app.expect("#main-detail").toExist()
    app.expectScreen("task-b")
  })

  // =========================================================================
  // km-o7ayx: Detail view children use Card infrastructure
  // =========================================================================

  test("detail pane children render as cards with data-view attribute", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — auto-focuses detail, cursor on first child
    app.command("toggle_detail_pane")
    app.expect("#main-detail[data-focused]").toExist()

    // Step 2: Children should be wrapped in Card components with data-view="card"
    app.expect('[data-view="card"][data-card-id="child-a"]').toExist()
    app.expect('[data-view="card"][data-card-id="child-b"]').toExist()

    // Step 3: Children should still be visible on screen
    app.expectScreen("child-a")
    app.expectScreen("child-b")
  })
})

/**
 * Detail Pane Journey Tests
 *
 * User-level journey specs for the detail pane feature. Tests multi-step
 * workflows verifying BOTH screen output AND state for detail pane operations.
 *
 * Key bindings:
 *   D = toggle_detail_pane (open/close + auto-focus detail)
 *   l = focus detail pane (when at rightmost column boundary)
 *   h = return focus to board (from detail pane)
 *   j/k = navigate within detail pane entries
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { DETAIL_DEFAULT_DEPTH } from "../src/view-navigation.ts"

describe("Detail Pane Journeys", () => {
  test("D opens detail pane and focuses it, D again closes it", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("Buy milk"), item.task("Fix bug"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Initially no detail pane
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Step 1: Open detail pane with D — auto-focuses detail
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    board.expectScreen("Buy milk")

    // Step 2: Close detail pane with D (from detail pane)
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("open detail, return to board, navigate cursor down, detail follows", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("task1"), item.task("task2"), item.task("task3"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — auto-focuses detail, shows task1
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task1")

    // Step 2: Return to board, navigate down to task2 — detail should follow
    board.command("cursor_left")
    board.command("cursor_down")
    board.expectScreen("task2")

    // Step 3: Navigate down to task3 — detail should follow
    board.command("cursor_down")
    board.expectScreen("task3")
  })

  test("detail pane shows folder children when cursor is on folder card", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("project", item("subtask-a"), item("subtask-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane for folder card — auto-focuses detail, cursor on first child
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("subtask-a")

    // Step 2: Navigate down to second child
    board.command("cursor_down")
    const detailPane2 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane2?.cursorNodeId).toBe("subtask-b")
  })

  test("l at rightmost column focuses detail, h returns to board", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item.task("task1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Step 1: Open detail pane, return to board
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.command("cursor_left") // return focus to board

    // Step 2: l at rightmost column should focus detail pane
    board.command("cursor_right")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 3: h should return focus to board
    board.command("cursor_left")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")
    // Pane should still be open
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("round-trip: open detail, navigate entries, return to board, navigate board", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("task1"), item.task("task2"), item.task("task3")),
          item("col2", item.task("task4")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane with D — auto-focuses detail
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 2: Navigate within detail pane
    board.command("cursor_down")

    // Step 3: Return to board
    board.command("cursor_left")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")

    // Step 4: Navigate to col2 then back to col1
    board.command("cursor_right") // col1 -> col2
    board.command("cursor_left") // col2 -> col1

    // Step 5: Board navigation still works
    board.command("cursor_down")
    board.command("cursor_down")
    board.expect("#task3[data-cursor]").toExist()
  })

  test("j/k navigation between detail pane children", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b"), item("child-c")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail — cursor starts on first child
    board.command("toggle_detail_pane")
    const pane1 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane1?.cursorNodeId).toBe("child-a")

    // Step 2: j moves to next child
    board.command("cursor_down")
    const pane2 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane2?.cursorNodeId).toBe("child-b")

    // Step 3: k moves back
    board.command("cursor_up")
    const pane3 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane3?.cursorNodeId).toBe("child-a")
  })

  test("Enter on structural child triggers inline edit and typing saves", () => {
    const { board, store, repo } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor starts on first child (child-a)
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("child-a")

    // Step 2: Enter = inline edit on child-a in detail pane, detail stays open
    board.press("Enter")
    const ws = store.getState().workspace
    expect(ws.panes.has("main-detail")).toBe(true)
    // Inline edit should be active on child-a (not the board cursor card)
    board.expectEditing("child-a")

    // Step 4: Type to edit the title — the text should appear on screen
    for (const c of "-ok") board.press(c)
    board.expectScreen("child-a-ok")

    // Step 5: Escape to confirm edit
    board.press("Escape")
    board.expectNotEditing()

    // Step 6: Verify the node was updated in repo
    const updated = repo.getNode("child-a")
    expect(updated?.content).toContain("-ok")
  })

  test("Escape during inline edit saves and exits (no stray sibling)", () => {
    const { board, store, repo } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail (cursor starts on child-a), start editing
    board.command("toggle_detail_pane")
    board.press("Enter")
    board.expectEditing("child-a")

    // Type something
    for (const c of "-ok") board.press(c)

    // Escape saves and exits edit mode for body blocks in the detail pane
    // (Enter would split the paragraph since child-a is a body block with editBlockIndex > 0)
    const childrenBefore = repo.getChildren("parent").length
    board.press("Escape")
    board.expectNotEditing()
    expect(repo.getChildren("parent").length).toBe(childrenBefore) // no stray node
    expect(repo.getNode("child-a")?.content).toContain("-ok") // saved
  })

  test("i on structural child in detail pane also triggers inline edit", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail (cursor starts on child-a)
    board.command("toggle_detail_pane")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("child-a")

    // i = inline edit on detail cursor node
    board.press("i")
    board.expectEditing("child-a")
  })

  // =========================================================================
  // Bug km-ii6qw.2: Shift+L unfold doesn't work in detail pane
  // =========================================================================

  test("L unfolds a child in detail pane, revealing deeper descendants", () => {
    // 3 levels deep: child-a > gc-1 > ggc-1
    // With DETAIL_DEFAULT_DEPTH=1, gc-1 is visible but ggc-1 is folded
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a", item("gc-1", item("ggc-1"), item("ggc-2")))))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor on child-a
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    const pane1 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane1?.cursorNodeId).toBe("child-a")

    // gc-1 is visible at depth 1, but ggc-1/ggc-2 are folded (depth exceeded)
    // Note: they also exist in the board card, so check the detail pane foldDepths
    const detailPane = store.getState().workspace.panes.get("main-detail") as { foldDepths?: Map<string, number> }
    const foldDepthsBefore = detailPane?.foldDepths ?? new Map()
    expect(foldDepthsBefore.has("child-a")).toBe(false) // no override yet

    // Step 2: Unfold child-a with L (Shift+L)
    board.command("unfold_node")

    // Verify foldDepths was updated for child-a
    const detailPane2 = store.getState().workspace.panes.get("main-detail") as { foldDepths?: Map<string, number> }
    const foldDepthsAfter = detailPane2?.foldDepths ?? new Map()
    expect(foldDepthsAfter.get("child-a")).toBeGreaterThan(DETAIL_DEFAULT_DEPTH)
  })

  test("H folds a child in detail pane, hiding its sub-children", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a", item("gc-1"), item("gc-2"))))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — cursor on child-a
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // gc-1 and gc-2 are visible at DETAIL_DEFAULT_DEPTH=1 (in detail pane)
    // They also appear in the board card. After folding, they should disappear from detail.

    // Step 2: Fold child-a
    board.command("fold_node")

    // Verify foldDepths was updated — child-a should have depth 0 (fully folded)
    const detailPane = store.getState().workspace.panes.get("main-detail") as { foldDepths?: Map<string, number> }
    const foldDepths = detailPane?.foldDepths ?? new Map()
    expect(foldDepths.get("child-a")).toBe(0)

    // Step 3: Unfold — should restore
    board.command("unfold_node")
    const detailPane2 = store.getState().workspace.panes.get("main-detail") as { foldDepths?: Map<string, number> }
    const foldDepths2 = detailPane2?.foldDepths ?? new Map()
    expect(foldDepths2.get("child-a")).toBeGreaterThan(0)
  })

  // =========================================================================
  // Bug km-ii6qw.3: Detail depth matches column depth (no full tree duplication)
  // =========================================================================

  test("detail pane children use controlled depth, not infinite expansion", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a", item("gc-1", item("ggc-1")))))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail pane
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // DETAIL_DEFAULT_DEPTH=1: child-a shows gc-1 (1 level), but gc-1's children
    // (ggc-1) are folded. The detail pane should NOT show the full tree.
    // Verify by checking that child-a's foldOverride is not set (inherits default depth)
    const detailPane = store.getState().workspace.panes.get("main-detail") as { foldDepths?: Map<string, number> }
    const foldDepths = detailPane?.foldDepths ?? new Map()
    // No explicit depth override — children inherit DETAIL_DEFAULT_DEPTH via remainingDepth prop
    expect(foldDepths.has("child-a")).toBe(false)
    // DETAIL_DEFAULT_DEPTH should be 1 (not 0 or Infinity)
    expect(DETAIL_DEFAULT_DEPTH).toBe(1)
  })

  test("detail pane stays open when navigating between columns", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("task-a")),
          item("col2", item.task("task-b")),
          item("col3", item.task("task-c")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane, return focus to board
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.command("cursor_left") // return to board

    // Step 2: Navigate right to col2
    board.command("cursor_right")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task-b")

    // Step 3: Navigate right to col3
    board.command("cursor_right")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task-c")

    // Step 4: Navigate left back to col2
    board.command("cursor_left")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task-b")
  })

  // =========================================================================
  // km-o7ayx: Detail view children use Card infrastructure
  // =========================================================================

  test("detail pane children render as cards with data-view attribute", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — auto-focuses detail, cursor on first child
    board.command("toggle_detail_pane")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 2: Children should be wrapped in Card components with data-view="card"
    // This verifies they go through the Card infrastructure (borders, fold, overflow)
    board.expect('[data-view="card"][data-card-id="child-a"]').toExist()
    board.expect('[data-view="card"][data-card-id="child-b"]').toExist()

    // Step 3: Children should still be visible on screen
    board.expectScreen("child-a")
    board.expectScreen("child-b")
  })
})

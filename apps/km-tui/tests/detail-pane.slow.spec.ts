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
import { getActiveBoardPane } from "../src/board-app-store.ts"

describe("Detail Pane Journeys", () => {
  test("D opens detail pane and focuses it, D again closes it", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("Buy milk"), item.task("Fix bug"))),
      { checkIncremental: false, incremental: false },
    )

    // Initially no detail pane
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Step 1: Open detail pane with D — auto-focuses detail
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")
    board.expectScreen("Buy milk")

    // Step 2: Close detail pane with D (from detail pane)
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("open detail, return to board, navigate cursor down, detail follows", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("task1"), item.task("task2"), item.task("task3"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — auto-focuses detail, shows task1
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task1")

    // Step 2: Return to board, navigate down to task2 — detail should follow
    board.press("h")
    board.press("j")
    board.expectScreen("task2")

    // Step 3: Navigate down to task3 — detail should follow
    board.press("j")
    board.expectScreen("task3")
  })

  test("detail pane shows folder children when cursor is on folder card", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("project", item("subtask-a"), item("subtask-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane for folder card — auto-focuses detail
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Step 2: Navigate down in detail to see children (D auto-focused detail)
    board.press("j")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("subtask-a")

    // Step 3: Continue navigating
    board.press("j")
    const detailPane2 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane2?.cursorNodeId).toBe("subtask-b")
  })

  test("l at rightmost column focuses detail, h returns to board", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("task1"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane, return to board
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.press("h") // return focus to board

    // Step 2: l at rightmost column should focus detail pane
    board.press("l")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 3: h should return focus to board
    board.press("h")
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
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 2: Navigate within detail pane
    board.press("j")

    // Step 3: Return to board
    board.press("h")
    expect(store.getState().workspace.focusedPaneId).not.toBe("main-detail")

    // Step 4: Navigate to col2 then back to col1
    board.press("l") // col1 -> col2
    board.press("h") // col2 -> col1

    // Step 5: Board navigation still works
    board.press("j")
    board.press("j")
    board.expect("#task3[data-cursor]").toExist()
  })

  test("j/k navigation in detail pane with k returning to topbar", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("my-task"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail — D auto-focuses detail pane
    board.press("D")

    // Step 2: Navigate down from topbar to first entry
    board.press("j")
    const pane1 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane1?.cursorNodeId).not.toBe("__topbar__")

    // Step 3: Navigate back up to topbar
    board.press("k")
    const pane2 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane2?.cursorNodeId).toBe("__topbar__")
  })

  test("Enter on structural child triggers inline edit and typing saves", () => {
    const { board, store, repo } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — D auto-focuses detail
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 2: Navigate to structural child (folders have no metadata)
    board.press("j")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("child-a")

    // Step 3: Enter = inline edit on child-a in detail pane, detail stays open
    board.press("Enter")
    const ws = store.getState().workspace
    expect(ws.panes.has("main-detail")).toBe(true)
    // Inline edit should be active on child-a (not the board cursor card)
    const editBlock = getActiveBoardPane(store.getState())?.inlineEditBlock
    expect(editBlock).not.toBeNull()
    expect(editBlock?.nodeId).toBe("child-a")

    // Step 4: Type to edit the title — the text should appear on screen
    for (const c of "-ok") board.press(c)
    board.expectScreen("child-a-ok")

    // Step 5: Escape to confirm edit
    board.press("Escape")
    expect(getActiveBoardPane(store.getState())?.inlineEditBlock).toBeNull()

    // Step 6: Verify the node was updated in repo
    const updated = repo.getNode("child-a")
    expect(updated?.content).toContain("-ok")
  })

  test("i on structural child in detail pane also triggers inline edit", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Open detail, navigate to child-a
    board.press("D")
    board.press("j")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("child-a")

    // i = inline edit on detail cursor node
    board.press("i")
    expect(getActiveBoardPane(store.getState())?.inlineEditBlock?.nodeId).toBe("child-a")
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
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.press("h") // return to board

    // Step 2: Navigate right to col2
    board.press("l")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task-b")

    // Step 3: Navigate right to col3
    board.press("l")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task-c")

    // Step 4: Navigate left back to col2
    board.press("h")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task-b")
  })
})

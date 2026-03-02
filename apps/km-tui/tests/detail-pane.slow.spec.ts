/**
 * Detail Pane Journey Tests
 *
 * User-level journey specs for the detail pane feature. Tests multi-step
 * workflows verifying BOTH screen output AND state for detail pane operations.
 *
 * Complements detail-pane.slow.test.ts which focuses on rendering, metadata
 * display, and individual assertions. These journey tests cover user stories:
 * - Open detail pane (D key), navigate entries, close (D again)
 * - Detail pane shows correct content for folders vs tasks
 * - Cursor navigation in detail pane (j/k within entries)
 * - Switching between board and detail pane focus
 *
 * Key bindings:
 *   D = toggle_detail_pane (open/close)
 *   l = focus detail pane (when at rightmost column boundary)
 *   h = return focus to board (from detail pane)
 *   j/k = navigate within detail pane entries
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Detail Pane Journeys", () => {
  test("D opens detail pane, D again closes it", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("Buy milk"), item.task("Fix bug"))),
      { checkIncremental: false, incremental: false },
    )

    // Initially no detail pane
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Step 1: Open detail pane with D
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("Buy milk")

    // Step 2: Close detail pane with D
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)
  })

  test("open detail, navigate board cursor down, detail follows", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("task1"), item.task("task2"), item.task("task3"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane — shows task1
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
    board.expectScreen("task1")

    // Step 2: Navigate down to task2 — detail should follow
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

    // Step 1: Open detail pane for folder card
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Step 2: Navigate to detail pane (l at rightmost column)
    board.press("l")

    // Step 3: Navigate down in detail to see children
    board.press("j")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("subtask-a")

    // Step 4: Continue navigating
    board.press("j")
    const detailPane2 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane2?.cursorNodeId).toBe("subtask-b")
  })

  test("l at rightmost column focuses detail, h returns to board", () => {
    const { board, store, focusManager } = testEnv(
      () => item("board", item("col1", item.task("task1"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Step 2: l at rightmost column should focus detail pane
    board.press("l")
    expect(focusManager.getSnapshot().activeId).toBe("detail-pane")

    // Step 3: h should return focus to board
    board.press("h")
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")
    // Pane should still be open
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
  })

  test("round-trip: open detail, focus it, navigate entries, return to board, navigate board", () => {
    const { board, store, focusManager } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.task("task1"), item.task("task2"), item.task("task3")),
          item("col2", item.task("task4")),
        ),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane with D
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Step 2: Focus detail pane with l (navigate past col2 to detail)
    board.press("l") // col1 -> col2
    board.press("l") // col2 -> detail pane
    expect(focusManager.getSnapshot().activeId).toBe("detail-pane")

    // Step 3: Navigate within detail pane
    board.press("j")

    // Step 4: Return to board
    board.press("h")
    expect(focusManager.getSnapshot().activeId).not.toBe("detail-pane")

    // Step 5: Board navigation still works — j navigates within col2
    // col2 only has task4, so pressing h should go back to col1
    board.press("h")
    // We should now be in col1 — verify board is still navigable
    board.press("j")
    board.press("j")
    board.expect("#task3[data-cursor]").toExist()
  })

  test("j/k navigation in detail pane with k returning to topbar", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item.task("my-task"))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail and focus it
    board.press("D")
    board.press("l") // focus detail pane

    // Step 2: Navigate down from topbar to first entry
    board.press("j")
    const pane1 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane1?.cursorNodeId).not.toBe("__topbar__")

    // Step 3: Navigate back up to topbar
    board.press("k")
    const pane2 = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(pane2?.cursorNodeId).toBe("__topbar__")
  })

  test("Enter on structural child zooms board and closes detail pane", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("parent", item("child-a"), item("child-b")))),
      { checkIncremental: false, incremental: false },
    )

    // Step 1: Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Step 2: Focus detail pane with n
    board.press("n")
    expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

    // Step 3: Navigate to structural child (folders have no metadata)
    board.press("j")
    const detailPane = store.getState().workspace.panes.get("main-detail") as { cursorNodeId?: string }
    expect(detailPane?.cursorNodeId).toBe("child-a")

    // Step 4: Enter zooms board into child-a and closes detail
    board.press("Enter")
    const ws = store.getState().workspace
    expect(ws.panes.has("main-detail")).toBe(false)
    expect(ws.focusedPaneId).toBe("main")
    expect((ws.panes.get("main") as { rootId?: string })?.rootId).toBe("child-a")
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

    // Step 1: Open detail pane
    board.press("D")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

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

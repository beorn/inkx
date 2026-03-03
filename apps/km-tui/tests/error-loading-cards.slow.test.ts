/**
 * Regression: km-tui.error-loading-cards
 *
 * After search navigating to a card, opening detail pane, closing it,
 * and navigating, the board should NOT show 'Error loading cards view'.
 *
 * Root cause: ErrorBoundary in BoardCore had no resetKey, so a transient
 * render error (e.g., during zoom state transition) permanently latched
 * the boundary into error state. Fix: add resetKey that changes on
 * navigation state changes, plus onError logging for future diagnosis.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/board-app-store.ts"

describe("km-tui.error-loading-cards: no error after search nav + detail pane close", () => {
  test("search navigate → open detail pane → close → navigate does not crash", () => {
    // Deep tree: root > folder > file > section > card
    const { board, store } = testEnv(
      () =>
        item.root(
          "Vault",
          item.folder(
            "Projects",
            item.file(
              "ProjectAlpha",
              item.section("Design", item("mockups"), item("wireframes")),
              item.section("Dev", item("backend"), item("frontend")),
            ),
          ),
          item.folder("Archive", item.file("OldProject", item.section("Legacy", item("old-task")))),
        ),
      { columns: 120, rows: 40 },
    )

    // Search for a deeply nested card
    board.press("cmd+f")
    for (const c of "wireframes") board.press(c)
    board.press("Enter")

    // After search: should have zoomed, cursor on wireframes
    expect(getActiveBoardPane(store.getState())!.cursorNodeId).toBe("wireframes")

    // Open detail pane
    board.press("P")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close detail pane
    board.press("P")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Navigate — this should NOT throw or show error
    board.press("j") // move down
    board.press("k") // move up
    board.press("l") // move right
    board.press("h") // move left

    // The board should render without error
    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("search navigate → detail pane → Escape close → navigate does not crash", () => {
    const { board, store } = testEnv(
      () =>
        item.root(
          "Root",
          item.folder(
            "Notes",
            item.file(
              "Meeting",
              item.section("Agenda", item("topic-1"), item("topic-2")),
              item.section("Actions", item("action-1"), item("action-2")),
            ),
          ),
        ),
      { columns: 120, rows: 40 },
    )

    // Search and navigate to a nested card
    board.press("cmd+f")
    for (const c of "action-2") board.press(c)
    board.press("Enter")

    expect(getActiveBoardPane(store.getState())!.cursorNodeId).toBe("action-2")

    // Open detail pane
    board.press("P")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close with Escape
    board.press("Escape")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Navigate — should not crash
    board.press("j")
    board.press("l")
    board.press("h")
    board.press("k")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("search navigate → zoom back with Z → no error", () => {
    const { board, store } = testEnv(
      () =>
        item.root(
          "Main",
          item.folder("Work", item.file("Tasks", item.section("Sprint1", item("task-alpha"), item("task-beta")))),
          item.folder("Personal", item.file("Todo", item.section("Home", item("clean")))),
        ),
      { columns: 120, rows: 40 },
    )

    const originalRoot = getActiveBoardPane(store.getState())!.rootId

    // Search navigate to a deep node
    board.press("cmd+f")
    for (const c of "task-beta") board.press(c)
    board.press("Enter")

    // Root should have changed (zoomed)
    expect(getActiveBoardPane(store.getState())!.rootId).not.toBe(originalRoot)
    expect(getActiveBoardPane(store.getState())!.cursorNodeId).toBe("task-beta")

    // Z to zoom back
    board.press("Z")

    // Navigate
    board.press("j")
    board.press("l")
    board.press("h")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("search navigate with many columns + detail pane cycle does not crash", () => {
    // Mimics asana vault: many sections (columns) with multiple tasks each
    const { board, store } = testEnv(
      () =>
        item.root(
          "AsanaVault",
          item.folder(
            "Project-1",
            item.file(
              "Sprint-Board",
              item.section("Inbox", item("task-inbox-1"), item("task-inbox-2"), item("task-inbox-3")),
              item.section("Backlog", item("task-backlog-1"), item("task-backlog-2")),
              item.section("In-Progress", item("task-wip-1"), item("task-wip-2")),
              item.section("Review", item("task-review-1")),
              item.section("Done", item("task-done-1"), item("task-done-2"), item("task-done-3")),
            ),
          ),
          item.folder(
            "Project-2",
            item.file(
              "Roadmap",
              item.section("Phase-1", item("milestone-1a"), item("milestone-1b")),
              item.section("Phase-2", item("milestone-2a")),
            ),
          ),
        ),
      { columns: 120, rows: 40 },
    )

    // Search for a deeply nested card in a different project
    board.press("cmd+f")
    for (const c of "milestone-2a") board.press(c)
    board.press("Enter")

    expect(getActiveBoardPane(store.getState())!.cursorNodeId).toBe("milestone-2a")

    // Open detail pane
    board.press("P")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(true)

    // Close detail pane
    board.press("P")
    expect(store.getState().workspace.panes.has("main-detail")).toBe(false)

    // Navigate extensively — stress the ErrorBoundary recovery
    board.press("j")
    board.press("j")
    board.press("k")
    board.press("l")
    board.press("l")
    board.press("h")
    board.press("h")
    board.press("j")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("multiple search + detail pane cycles do not accumulate errors", () => {
    const { board, store } = testEnv(
      () =>
        item.root(
          "Root",
          item.folder(
            "Folder-A",
            item.file(
              "File-1",
              item.section("Sec-1", item("card-1a"), item("card-1b")),
              item.section("Sec-2", item("card-2a"), item("card-2b")),
            ),
          ),
          item.folder("Folder-B", item.file("File-2", item.section("Sec-3", item("card-3a"), item("card-3b")))),
        ),
      { columns: 120, rows: 40 },
    )

    // First cycle: search → detail → close → navigate
    board.press("cmd+f")
    for (const c of "card-1b") board.press(c)
    board.press("Enter")
    expect(getActiveBoardPane(store.getState())!.cursorNodeId).toBe("card-1b")
    board.press("P") // open detail
    board.press("P") // close detail
    board.press("j")

    let output = board.screenshot()
    expect(output).not.toContain("Error loading")

    // Zoom back out
    board.press("Escape")
    board.press("Escape")

    // Second cycle: search to a different node
    board.press("cmd+f")
    for (const c of "card-3a") board.press(c)
    board.press("Enter")
    expect(getActiveBoardPane(store.getState())!.cursorNodeId).toBe("card-3a")
    board.press("P") // open detail
    board.press("Escape") // close detail with Escape (unfocuses detail pane)
    board.press("j")
    board.press("l")

    output = board.screenshot()
    expect(output).not.toContain("Error loading")
  })
})

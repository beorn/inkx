/**
 * Regression: km-tui.error-loading-cards
 *
 * After search navigating to a card, opening detail pane, closing it,
 * and navigating, the board should NOT show 'Error loading cards view'.
 * The root cause is likely zoom/navigation state becoming invalid after
 * detail pane close.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

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
    board.press("/")
    for (const c of "wireframes") board.press(c)
    board.press("Enter")

    // After search: should have zoomed, cursor on wireframes
    expect(store.getState().cursorNodeId).toBe("wireframes")

    // Open detail pane
    board.press(" ")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Close detail pane
    board.press(" ")
    expect(store.getState().ui.showDetailPane).toBe(false)

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
    board.press("/")
    for (const c of "action-2") board.press(c)
    board.press("Enter")

    expect(store.getState().cursorNodeId).toBe("action-2")

    // Open detail pane
    board.press(" ")
    expect(store.getState().ui.showDetailPane).toBe(true)

    // Close with Escape
    board.press("Escape")
    expect(store.getState().ui.showDetailPane).toBe(false)

    // Navigate — should not crash
    board.press("j")
    board.press("l")
    board.press("h")
    board.press("k")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })

  test("search navigate → zoom back with Escape → no error", () => {
    const { board, store } = testEnv(
      () =>
        item.root(
          "Main",
          item.folder("Work", item.file("Tasks", item.section("Sprint1", item("task-alpha"), item("task-beta")))),
          item.folder("Personal", item.file("Todo", item.section("Home", item("clean")))),
        ),
      { columns: 120, rows: 40 },
    )

    const originalRoot = store.getState().rootId

    // Search navigate to a deep node
    board.press("/")
    for (const c of "task-beta") board.press(c)
    board.press("Enter")

    // Root should have changed (zoomed)
    expect(store.getState().rootId).not.toBe(originalRoot)
    expect(store.getState().cursorNodeId).toBe("task-beta")

    // Escape to zoom back
    board.press("Escape")

    // Navigate
    board.press("j")
    board.press("l")
    board.press("h")

    const output = board.screenshot()
    expect(output).not.toContain("Error loading cards view")
    expect(output).not.toContain("Error loading")
  })
})

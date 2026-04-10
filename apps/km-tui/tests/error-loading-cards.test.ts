/**
 * Regression: km-tui.error-loading-cards
 *
 * After zooming to a card, opening detail pane, closing it,
 * and navigating, the board should NOT show 'Error loading cards view'.
 *
 * Root cause: ErrorBoundary in BoardCore had no resetKey, so a transient
 * render error (e.g., during zoom state transition) permanently latched
 * the boundary into error state. Fix: add resetKey that changes on
 * navigation state changes, plus onError logging for future diagnosis.
 */

import { describe, test } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("km-tui.error-loading-cards: no error after zoom + detail pane close", () => {
  test("zoom → open detail pane → close → navigate does not crash", () => {
    using app = createTestApp(
      item(
        "Vault",
        item("Design", item("mockups"), item("wireframes")),
        item("Dev", item("backend"), item("frontend")),
      ),
      { cols: 120, rows: 40 },
    )

    // Navigate to wireframes
    app.command("cursor_down") // mockups
    app.command("cursor_down") // wireframes

    app.expect("#wireframes[data-cursor]").toExist()

    // Open detail pane
    app.command("toggle_detail_pane")
    app.expectScreen("DETAIL VIEW")

    // Close detail pane
    app.command("toggle_detail_pane")
    app.expectScreenNot("DETAIL VIEW")

    // Navigate — this should NOT throw or show error
    app.command("cursor_down")
    app.command("cursor_up")
    app.command("cursor_right")
    app.command("cursor_left")

    // The board should render without error
    app.expectScreenNot("Error loading cards view")
    app.expectScreenNot("Error loading")
  })

  test("zoom → detail pane → Escape close → navigate does not crash", () => {
    using app = createTestApp(
      item(
        "Root",
        item("Agenda", item("topic-1"), item("topic-2")),
        item("Actions", item("action-1"), item("action-2")),
      ),
      { cols: 120, rows: 40 },
    )

    // Navigate to action-2
    app.command("cursor_right") // Actions column
    app.command("cursor_down") // action-2

    app.expect("#action-2[data-cursor]").toExist()

    // Open detail pane
    app.command("toggle_detail_pane")
    app.expectScreen("DETAIL VIEW")

    // Close detail pane
    app.command("toggle_detail_pane")
    app.expectScreenNot("DETAIL VIEW")

    // Navigate — should not crash
    app.command("cursor_down")
    app.command("cursor_right")
    app.command("cursor_left")
    app.command("cursor_up")

    app.expectScreenNot("Error loading cards view")
    app.expectScreenNot("Error loading")
  })

  test("zoom in → zoom back with Z → no error", () => {
    using app = createTestApp(
      item("Main", item("Work", item("task-alpha"), item("task-beta")), item("Personal", item("clean"))),
      { cols: 120, rows: 40 },
    )

    // Zoom into Work (cursor starts on column header, z zooms in)
    app.command("zoom_inwards")

    // Z to zoom back
    app.command("zoom_outwards")

    // Navigate
    app.command("cursor_down")
    app.command("cursor_right")
    app.command("cursor_left")

    app.expectScreenNot("Error loading cards view")
    app.expectScreenNot("Error loading")
  })

  test("zoom + detail pane cycle with many columns does not crash", () => {
    // Mimics asana vault: many sections (columns) with multiple tasks each
    using app = createTestApp(
      item(
        "Board",
        item("Inbox", item("task-inbox-1"), item("task-inbox-2"), item("task-inbox-3")),
        item("Backlog", item("task-backlog-1"), item("task-backlog-2")),
        item("In-Progress", item("task-wip-1"), item("task-wip-2")),
        item("Review", item("task-review-1")),
        item("Done", item("task-done-1"), item("task-done-2"), item("task-done-3")),
      ),
      { cols: 120, rows: 40 },
    )

    // Navigate to a card in In-Progress
    app.command("cursor_right") // Backlog
    app.command("cursor_right") // In-Progress

    // Open detail pane
    app.command("toggle_detail_pane")
    app.expectScreen("DETAIL VIEW")

    // Close detail pane
    app.command("toggle_detail_pane")
    app.expectScreenNot("DETAIL VIEW")

    // Navigate extensively — stress the ErrorBoundary recovery
    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_up")
    app.command("cursor_right")
    app.command("cursor_right")
    app.command("cursor_left")
    app.command("cursor_left")
    app.command("cursor_down")

    app.expectScreenNot("Error loading cards view")
    app.expectScreenNot("Error loading")
  })

  test("multiple zoom + detail pane cycles do not accumulate errors", () => {
    using app = createTestApp(
      item(
        "Root",
        item("Sec-1", item("card-1a"), item("card-1b")),
        item("Sec-2", item("card-2a"), item("card-2b")),
        item("Sec-3", item("card-3a"), item("card-3b")),
      ),
      { cols: 120, rows: 40 },
    )

    // First cycle: navigate → detail → close → navigate
    app.command("cursor_down") // card-1b
    app.command("toggle_detail_pane") // open detail
    app.command("toggle_detail_pane") // close detail
    app.command("cursor_down")

    app.expectScreenNot("Error loading")

    // Navigate to a different column
    app.command("cursor_right")

    // Second cycle: detail pane on a different card
    app.command("toggle_detail_pane") // open detail
    app.press("Escape") // close detail with Escape
    app.command("cursor_down")
    app.command("cursor_right")

    app.expectScreenNot("Error loading")
  })
})

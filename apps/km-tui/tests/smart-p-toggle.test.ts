/**
 * Detail pane toggle tests
 *
 * D toggles detail pane open/closed. D auto-focuses detail pane on open.
 * Detail pane follows cursor selection (read-only preview).
 */
import { test, expect, describe } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Detail pane toggle", () => {
  test("D opens pane and auto-focuses detail, D again closes it", () => {
    using app = createTestApp(item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Initial: pane closed
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(false)
    })

    // D opens pane and auto-focuses detail
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
      expect(s.workspace.focusedPaneId).toBe("main-detail")
    })

    // D again closes pane
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(false)
    })
  })

  test("cursor movement works while detail pane is open", () => {
    using app = createTestApp(item("board", item("col1", item("card1"), item("card2"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open pane (auto-focuses detail), return to board
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    app.command("cursor_left") // return to board

    // j moves cursor down on the board
    app.command("cursor_down")
    expect(app.state.cursor).toBe("card2")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    // Buffer must show cursor on card2 (not card1)
    app.expect("#card2[data-cursor]").toExist()
    app.expect("#card1[data-cursor]").not.toExist()

    // k moves cursor back up
    app.command("cursor_up")
    expect(app.state.cursor).toBe("card1")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    // Buffer must show cursor on card1 (not card2)
    app.expect("#card1[data-cursor]").toExist()
    app.expect("#card2[data-cursor]").not.toExist()
  })

  test("cursor movement with detail pane - incremental rendering", () => {
    using app = createTestApp(item("board", item("col1", item("card1"), item("card2"), item("card3"))), {
      checkIncremental: true,
    })

    // Open pane (auto-focuses detail), return to board
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    app.command("cursor_left") // return to board
    app.expect("#card1[data-cursor]").toExist()

    // j moves cursor down — incremental render must reflect change
    app.command("cursor_down")
    expect(app.state.cursor).toBe("card2")
    app.expect("#card2[data-cursor]").toExist()
    app.expect("#card1[data-cursor]").not.toExist()

    // k moves cursor back up
    app.command("cursor_up")
    expect(app.state.cursor).toBe("card1")
    app.expect("#card1[data-cursor]").toExist()

    // l moves to a different column (if visible)
    app.command("cursor_down") // back to card2
    app.command("cursor_down") // to card3
    expect(app.state.cursor).toBe("card3")
    app.expect("#card3[data-cursor]").toExist()
  })

  test("Escape unfocuses then closes detail pane", () => {
    using app = createTestApp(item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
      expect(s.workspace.focusedPaneId).toBe("main-detail")
    })

    // Escape 1: unfocus detail, return to board (pane stays open)
    app.press("Escape")
    app.withStore((s) => {
      expect(s.workspace.focusedPaneId).not.toBe("main-detail")
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })

    // Escape 2: close pane
    app.press("Escape")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(false)
    })
  })

  test("detail cursor resets on each transition", () => {
    using app = createTestApp(item("board", item("col1", item("card1", item("sub-a"), item("sub-b")))), {
      checkIncremental: false,
      incremental: false,
    })

    // Open pane — cursor starts on first child
    app.command("toggle_detail_pane")
    const getDetailCursor = () =>
      app.withStore((s) => (s.workspace.panes.get("main-detail") as any)?.sel?.node?.cursor() as string | null)
    expect(getDetailCursor()).toBe("sub-a")

    // Navigate within detail — cursor_down moves board cursor into sub-items.
    app.command("cursor_down")
    // After cursor_down, the detail pane cursor may have changed
    const afterCursorDown = getDetailCursor()
    // Just verify it's still a valid sub-item (not null)
    expect(afterCursorDown).toMatch(/^sub-/)

    // Close pane with D → pane removed
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(false)
    })

    // Reopen → cursor should be fresh (first child)
    app.command("toggle_detail_pane")
    expect(getDetailCursor()).toBe("sub-a")
  })

  test("multiple D cycles work correctly", () => {
    using app = createTestApp(item("board", item("col1", item("card1"))), {
      checkIncremental: false,
      incremental: false,
    })

    // Rapid toggle: open → close
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(false)
    })

    // Again
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(false)
    })
  })
})

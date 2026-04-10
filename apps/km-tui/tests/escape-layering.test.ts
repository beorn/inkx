/**
 * Escape Layering Tests (km-all.kb-escape)
 *
 * Verifies the escape key pops one layer at a time from the focus stack:
 *
 * 0. Move mode → exit mode
 * 1. Text edit mode → exit to node mode (save edit, cursor stays on node)
 * 2. Pane focused → unfocus pane, return focus to board (pane stays open)
 * 3. Dialog open → close topmost dialog
 * 4. Selection active → collapse to cursor (repeatable, absorbs Escape)
 */

import { describe, test, expect } from "vitest"
import { item, createDriverTest } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

describe("Escape Layering", () => {
  // ---------------------------------------------------------------------------
  // Layer 0: Move mode
  // ---------------------------------------------------------------------------

  test("Escape cancels move mode", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"))))
    app.expect("#1a[data-cursor]").toExist()

    // Enter move mode with 'mm'
    app.command("enter_move_mode")
    app.withStore((s) => expect(getActiveBoardPane(s)!.moveState.active).toBe(true))

    // Escape cancels move mode
    app.press("Escape")
    app.withStore((s) => expect(getActiveBoardPane(s)!.moveState.active).toBe(false))
  })

  // ---------------------------------------------------------------------------
  // Layer 1: Text edit → node mode
  // ---------------------------------------------------------------------------

  test("Escape exits inline edit mode (saves content, cursor stays on node)", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    app.expect("#task1[data-cursor]").toExist()

    // Enter inline edit mode with 'i'
    app.press("i")
    app.expectEditing("task1")

    // Escape exits edit mode — cursor stays on same node
    app.press("Escape")
    app.expectNotEditing()
    app.expect("#task1[data-cursor]").toExist()
  })

  test("Escape exits inline edit mode after typing text (single press)", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))
    app.expect("#task1[data-cursor]").toExist()

    // Enter inline edit mode
    app.press("i")
    app.expectEditing("task1")

    // Type some text
    app.type(" hello")

    // Single Escape should exit edit mode — not require two presses
    app.press("Escape")
    app.expectNotEditing()
    app.expect("#task1[data-cursor]").toExist()
  })

  test("Escape exits edit mode on node with wikilink content (single press)", () => {
    using app = createTestApp.fromMarkdown("# Todo\n- Task with [[some link]] inside")

    // Cursor starts on the first card (the wikilink node)
    // Enter edit mode
    app.press("i")
    app.expectEditing()

    // Type to modify content (triggers save on exit)
    app.type(" edit")

    // Single Escape should exit — wikilink content must not interfere
    app.press("Escape")
    app.expectNotEditing()
  })

  // ---------------------------------------------------------------------------
  // Layer 2: Pane focused → unfocus pane (pane stays open)
  // ---------------------------------------------------------------------------

  test("Escape from detail pane: unfocus → close", () => {
    using app = createTestApp(item("board", item("col", item("card1"), item("card2"))))

    // D opens + auto-focuses detail pane
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.panes.has("main-detail")).toBe(true)
      expect(s.workspace.focusedPaneId).toBe("main-detail")
    })

    // Escape 1: unfocus detail → return to board (pane stays open)
    app.press("Escape")
    app.withStore((s) => {
      expect(s.workspace.focusedPaneId).not.toBe("main-detail")
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })

    // Escape 2: close pane
    app.press("Escape")
    app.withStore((s) => expect(s.workspace.panes.has("main-detail")).toBe(false))
  })

  // ---------------------------------------------------------------------------
  // Layer 3: Dialog open → close topmost dialog
  // ---------------------------------------------------------------------------

  test("Escape closes help overlay", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    // Open help with ?
    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // Escape closes help
    app.press("Escape")
    expect(app.state.overlay).toBeNull()
  })

  test("Escape closes local find bar", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    // Open local find with /
    app.command("local_find")
    app.withStore((s) => expect(getActiveBoardPane(s)!.localSearch).not.toBeNull())

    // Escape closes find bar
    app.press("Escape")
    app.withStore((s) => expect(getActiveBoardPane(s)!.localSearch).toBeNull())
  })

  test("Escape closes new item dialog", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    // Open new item dialog with Cmd+shift+Enter
    app.press("cmd+shift+Enter")
    app.withStore((s) => expect(s.ui.showNewItemDialog).toBe(true))

    // Escape closes dialog
    app.press("Escape")
    app.withStore((s) => expect(s.ui.showNewItemDialog).toBe(false))
  })

  // ---------------------------------------------------------------------------
  // Layer 4: Selection active → collapse to cursor
  // ---------------------------------------------------------------------------

  test("Escape collapses multi-selection to cursor", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
    app.expect("#1a[data-cursor]").toExist()

    // Select multiple items with Shift+ArrowDown
    app.press("shift+ArrowDown")
    app.press("shift+ArrowDown")
    expect(app.state.selection.length).toBeGreaterThan(1)

    // Escape collapses multi-selection to single cursor
    app.press("Escape")
    expect(app.state.selection.length).toBeLessThanOrEqual(1)
  })

  test("Escape absorbs when only cursor is set (no bell)", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))
    app.expect("#task1[data-cursor]").toExist()

    // Escape with just a cursor: collapses (no-op on already-collapsed) and absorbs
    app.press("Escape")
    expect(app.bell).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Priority ordering: higher layers take precedence
  // ---------------------------------------------------------------------------

  test("Escape unfocuses detail pane before clearing selection", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Select items
    app.press("shift+ArrowDown")
    expect(app.state.selection.length).toBeGreaterThan(1)

    // D opens + auto-focuses detail pane
    app.command("toggle_detail_pane")
    app.withStore((s) => {
      expect(s.workspace.focusedPaneId).toBe("main-detail")
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })

    // Escape 1: unfocus detail → return to board (pane stays open)
    app.press("Escape")
    app.withStore((s) => {
      expect(s.workspace.focusedPaneId).not.toBe("main-detail")
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })
    // Selection is still there
    expect(app.state.selection.length).toBeGreaterThan(1)

    // Escape 2: close pane (selection still there)
    app.press("Escape")
    app.withStore((s) => expect(s.workspace.panes.has("main-detail")).toBe(false))
    expect(app.state.selection.length).toBeGreaterThan(1)
  })

  // ---------------------------------------------------------------------------
  // Full stack walkthrough
  // ---------------------------------------------------------------------------

  test("multiple Escapes peel layers one at a time (dialog → collapse)", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    // Open help dialog (layer 3)
    app.command("show_help")
    expect(app.state.overlay).toBe("help")

    // Escape 1: close help
    app.press("Escape")
    expect(app.state.overlay).toBeNull()

    // Escape 2+: collapses selection (absorbs — no bell)
    app.press("Escape")
    expect(app.bell).toBe(false)
  })

  test("pane open + selection: Escape unfocuses pane, closes pane, then collapses selection", () => {
    using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))

    // Create selection
    app.press("shift+ArrowDown")
    expect(app.state.selection.length).toBeGreaterThan(1)

    // D opens + auto-focuses detail pane
    app.command("toggle_detail_pane")
    app.withStore((s) => expect(s.workspace.focusedPaneId).toBe("main-detail"))

    // Escape 1: unfocus detail → return to board
    app.press("Escape")
    app.withStore((s) => {
      expect(s.workspace.focusedPaneId).not.toBe("main-detail")
      expect(s.workspace.panes.has("main-detail")).toBe(true)
    })

    // Escape 2: close pane (selection still active)
    app.press("Escape")
    app.withStore((s) => expect(s.workspace.panes.has("main-detail")).toBe(false))
    expect(app.state.selection.length).toBeGreaterThan(1)

    // Escape 3: collapse multi-selection to cursor
    app.press("Escape")
    expect(app.state.selection.length).toBeLessThanOrEqual(1)
  })

  // ---------------------------------------------------------------------------
  // Double-Escape Bug Regression (km-tui.double-esc)
  //
  // When local find (/) results are visible but the find bar input is closed,
  // pressing Escape during inline editing would fire find_close instead of
  // text.exit_edit. Fix: find_close requires not(isInlineEditing).
  // ---------------------------------------------------------------------------

  test("single Escape exits inline edit mode to normal mode", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    app.press("Enter") // enter edit mode

    // Single Escape should exit edit mode
    app.press("Escape")

    // Verify we're back in normal mode by pressing j to navigate
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()
  })

  test("single Escape after typing saves and exits to normal mode", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

    app.press("Enter")
    app.command("toggle_task_done")
    app.press("y")

    // Single Escape should save and exit
    app.press("Escape")

    // Content should be saved
    expect(app.repo.getNode("1a")?.content).toBe("1axy")

    // Should be in normal mode — j navigates
    app.command("cursor_down")
    app.expect("#1b[data-cursor]").toExist()
  })

  // FREEZE: needs store.getState() — uses store.setState() to set localSearch directly
  test("Escape exits inline edit before closing local find (regression)", () => {
    // Regression: when localSearch state exists and user is in inline edit,
    // Escape should exit edit mode (text.exit_edit) before closing find results.
    // The fix was: find_close requires not(isInlineEditing).
    const { board, repo, store } = createDriverTest(() => item("board", item("col1", item("alpha"), item("beta"))))

    // Set localSearch state directly (simulating confirmed find results visible)
    store.setState((s) => {
      const pane = getActiveBoardPane(s)
      if (pane) {
        pane.localSearch = {
          query: "a",
          isInputActive: false,
          matchIndex: 0,
          matchCount: 1,
          matchNodeIds: ["alpha"],
        }
      }
      return s
    })

    // Enter edit mode on the card
    board.press("Enter") // edit card "alpha"
    board.expectEditing("alpha")

    // Type something
    board.press("z")

    // Single Escape should exit edit mode (not close find results)
    board.press("Escape")
    board.expectNotEditing()

    // Content should be saved (alpha + z)
    expect(repo.getNode("alpha")?.content).toBe("alphaz")

    // Should be in normal mode — j navigates
    board.command("cursor_down")
    board.expect("#beta[data-cursor]").toExist()
  })
})

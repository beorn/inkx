/**
 * Mouse Click Targeting Tests
 *
 * Tests that mouse clicks correctly target:
 * - Column headers / empty space → deselect all (cursor to board root)
 * - Cards → select the card (card-level cursor)
 * - Ctrl-click → toggle multi-selection
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

// =============================================================================
// Column Header Click
// =============================================================================

describe("mouse click targeting", () => {
  test("clicking a column header selects the column", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Inbox", item("task-1"), item("task-2")),
        item("Projects", item("proj-a"), item("proj-b")),
      ),
      { cols: 80, rows: 24 },
    )

    // Initially cursor should be on a card (first card of first column)
    const cursorEl = app.q("[data-cursor]")
    expect(cursorEl.count()).toBeGreaterThan(0)

    // Find the second column's header position via its column element
    const col2 = app.q("[data-col-index='1'][data-column]")
    expect(col2.count()).toBeGreaterThan(0)
    const col2Box = col2.boundingBox()
    expect(col2Box).not.toBeNull()

    // Click on the column header area (row 0 of the column, which is the header)
    app.click(col2Box!.x + 2, col2Box!.y)

    // After clicking column header, cursor should be on the column (Projects)
    expect(app.state.cursor).toBe("Projects")
  })

  test("clicking a card selects that card", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Inbox", item("task-1"), item("task-2")),
        item("Projects", item("proj-a"), item("proj-b")),
      ),
      { cols: 80, rows: 24 },
    )

    // Find the second card in the first column
    const task2 = app.q("[id='task-2']")
    expect(task2.count()).toBeGreaterThan(0)
    const task2Box = task2.boundingBox()
    expect(task2Box).not.toBeNull()

    // Click on the card
    app.click(task2Box!.x + 1, task2Box!.y)

    // After clicking, cursor should be on task-2
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    // The cursor element should contain the task-2 content
    const cursorText = cursor.textContent()
    expect(cursorText).toContain("task-2")
  })

  test("clicking card in another column moves cursor there", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Inbox", item("task-1"), item("task-2")),
        item("Projects", item("proj-a"), item("proj-b")),
      ),
      { cols: 80, rows: 24 },
    )

    // Find a card in the second column
    const projA = app.q("[id='proj-a']")
    expect(projA.count()).toBeGreaterThan(0)
    const projABox = projA.boundingBox()
    expect(projABox).not.toBeNull()

    // Click on it
    app.click(projABox!.x + 1, projABox!.y)

    // Cursor should now be in the second column
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    const cursorText = cursor.textContent()
    expect(cursorText).toContain("proj-a")
  })

  test("clicking on a structural card border selects the card (not deselect to root)", () => {
    // Body cards are now flat (no border), so we use a structural card —
    // file/folder cards still render with a real round border. The original
    // bug (km-tui.card-border-click) was that clicking a card wrapper Box
    // without an `id` prop walked up to the column and deselected to root.
    // The data-card-id fix on the wrapper still applies to bordered cards.
    using app = createTestApp(
      item.root("board", item("Inbox", item.file("File A", item("task-a")), item.file("File B", item("task-b")))),
      { cols: 80, rows: 24 },
    )

    // Verify data-view="card" wrappers are present
    const cardWrappers = app.q("[data-view='card']")
    expect(cardWrappers.count(), "data-view='card' wrappers should exist").toBeGreaterThan(0)

    // Navigate to File B first (so we know cursor can land there)
    app.command("cursor_down")
    expect(app.state.cursor).toBe("File B")

    // Find the inner element's bounding box (inside the card border)
    const fileB = app.q("[id='File B'][data-view='item']")
    expect(fileB.count()).toBeGreaterThan(0)
    const innerBox = fileB.boundingBox()
    expect(innerBox).not.toBeNull()

    // Move cursor away from File B
    app.command("cursor_up")
    expect(app.state.cursor).toBe("File A")

    // Click on File B's border (1 column left of the inner content area).
    // The card border is rendered by the Card wrapper Box, which has data-card-id
    // but no `id` prop. Without the data-card-id fix, this would resolve to
    // the column and deselect to board root.
    app.click(innerBox!.x - 1, innerBox!.y)

    // Cursor should land on File B, not deselect to board root
    expect(app.state.cursor).toBe("File B")
  })

  test("clickDom drives both DOM dispatch and app-level handleMouse (km-tui.card-border-click)", () => {
    // Integration sanity check for clickDom — the full pipeline version of
    // click() that drives BOTH the app-level handleMouse AND the DOM-level
    // onClick dispatch. Matches the real runtime pipeline in
    // invokeEventHandler. See unit tests in use-card-interaction.test.ts
    // for direct verification of the walk-up resolver that this bug fixed.
    using app = createTestApp(item.root("board", item("Inbox", item("task-1"), item("task-2"), item("task-3"))), {
      cols: 80,
      rows: 24,
    })

    expect(app.state.cursor).toBe("task-1")
    const itemBox = app.q("[id='task-2'][data-view='item']")
    expect(itemBox.count(), "task-2 item exists").toBeGreaterThan(0)
    const ib = itemBox.boundingBox()
    expect(ib).not.toBeNull()

    // Click directly on task-2's content area. The full pipeline should
    // land the cursor on task-2.
    app.clickDom(ib!.x + 1, ib!.y)
    expect(app.state.cursor).toBe("task-2")
  })

  test("ctrl-click toggles multi-selection", () => {
    using app = createTestApp(item.root("board", item("Inbox", item("task-1"), item("task-2"), item("task-3"))), {
      cols: 80,
      rows: 24,
    })

    // Find the second card
    const task2 = app.q("[id='task-2']")
    expect(task2.count()).toBeGreaterThan(0)
    const task2Box = task2.boundingBox()
    expect(task2Box).not.toBeNull()

    // Ctrl-click to toggle selection
    app.click(task2Box!.x + 1, task2Box!.y, { ctrl: true })

    // The cursor should be on task-2 after ctrl-click
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    const cursorText = cursor.textContent()
    expect(cursorText).toContain("task-2")
  })

  test("clicking a body block inside a card selects it", () => {
    using app = createTestApp(
      item.root("board", item("Column", item("card-1", item.p("body text"), item("sub-item")))),
      { cols: 80, rows: 24 },
    )

    // Find the body block element
    const bodyEl = app.q("[id='body text']")
    expect(bodyEl.count()).toBeGreaterThan(0)
    const bodyBox = bodyEl.boundingBox()
    expect(bodyBox).not.toBeNull()

    // Click on the body block
    app.click(bodyBox!.x + 1, bodyBox!.y)

    // Cursor should move to the body block
    expect(app.state.cursor).toBe("body text")
  })

  test("clicking each child in a card selects the correct one", () => {
    using app = createTestApp(
      item.root("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { cols: 80, rows: 24 },
    )

    // Verify all children are rendered and get their positions
    const cardEl = app.q("[id='card']")
    const cardBox = cardEl.boundingBox()
    expect(cardBox).not.toBeNull()

    for (const id of ["child-1", "child-2", "child-3"]) {
      const el = app.q(`[id='${id}']`)
      expect(el.count(), `${id} should be rendered`).toBeGreaterThan(0)
      const box = el.boundingBox()!
      // Click at the center of the child element
      app.click(box.x + 1, box.y)
      expect(app.state.cursor, `click at y=${box.y} (card y=${cardBox!.y}) should select ${id}`).toBe(id)
    }
  })

  test("j/k navigate between siblings when inside a card", () => {
    using app = createTestApp(
      item.root("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { cols: 80, rows: 24 },
    )

    // Click on child-1 to enter sub-block navigation
    const el = app.q("[id='child-1']")
    const box = el.boundingBox()!
    app.click(box.x + 1, box.y)
    expect(app.state.cursor).toBe("child-1")

    // j → child-2
    app.command("cursor_down")
    expect(app.state.cursor).toBe("child-2")

    // j → child-3
    app.command("cursor_down")
    expect(app.state.cursor).toBe("child-3")

    // k → child-2
    app.command("cursor_up")
    expect(app.state.cursor).toBe("child-2")

    // k → child-1
    app.command("cursor_up")
    expect(app.state.cursor).toBe("child-1")

    // k from first child → parent (card title)
    app.command("cursor_up")
    expect(app.state.cursor).toBe("card")
  })

  test("j from last sub-block jumps to next card", () => {
    using app = createTestApp(
      item.root("board", item("Column", item("card-a", item("a-child-1"), item("a-child-2")), item("card-b"))),
      { cols: 80, rows: 24 },
    )

    // Click on a-child-2 (last child of card-a)
    const el = app.q("[id='a-child-2']")
    const box = el.boundingBox()!
    app.click(box.x + 1, box.y)
    expect(app.state.cursor).toBe("a-child-2")

    // j → next card (card-b), since there's no next sibling
    app.command("cursor_down")
    expect(app.state.cursor).toBe("card-b")
  })

  test("pressing Enter on a sub-block enters inline edit for that block", () => {
    using app = createTestApp(
      item.root("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { cols: 80, rows: 24, checkIncremental: false },
    )

    // Click on child-2 to select it
    const el = app.q("[id='child-2']")
    expect(el.count()).toBeGreaterThan(0)
    const box = el.boundingBox()!
    app.click(box.x + 1, box.y)
    expect(app.state.cursor).toBe("child-2")

    // Press Enter to enter inline edit
    app.command("enter_inline_edit")

    // Should be editing child-2, not the parent card
    app.expectEditing("child-2")
  })

  test("arrow up/down in edit mode navigates to adjacent node and stays in edit mode", () => {
    using app = createTestApp(item.root("board", item("Column", item("task-1"), item("task-2"), item("task-3"))), {
      cols: 80,
      rows: 24,
    })

    // Enter edit mode on task-1
    app.command("enter_inline_edit")
    app.expectEditing("task-1")

    // Arrow down → task-2, still in edit mode
    app.press("ArrowDown")
    expect(app.state.cursor).toBe("task-2")
    app.expectEditing("task-2")

    // Arrow down → task-3, still in edit mode
    app.press("ArrowDown")
    expect(app.state.cursor).toBe("task-3")
    app.expectEditing("task-3")

    // Arrow up → task-2, still in edit mode
    app.press("ArrowUp")
    expect(app.state.cursor).toBe("task-2")
    app.expectEditing("task-2")
  })

  test("clicking column header selects the column (not board root)", () => {
    using app = createTestApp(
      item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { cols: 80, rows: 24 },
    )

    // Navigate to second card
    app.command("cursor_down")
    expect(app.state.cursor).not.toBe("board")

    // Find the first column's header area
    const col1 = app.q("[data-col-index='0'][data-column]")
    expect(col1.count()).toBeGreaterThan(0)
    const col1Box = col1.boundingBox()
    expect(col1Box).not.toBeNull()

    // Click on the column header → selects the column
    app.click(col1Box!.x + 2, col1Box!.y)

    // Cursor should be on the column (Inbox), not board root
    expect(app.state.cursor).toBe("Inbox")
  })

  test("clicking empty space below the last card in a column deselects (cursor → null)", () => {
    // Regression: previously clicking below the last card in a column selected
    // the column. The user expectation is that clicking empty space (below the
    // last card) is the same as clicking outside everything — fully deselect.
    //
    // "Fully deselect" means cursor=null, NOT cursor=rootId. When cursor=rootId
    // the view tints the entire board (selection-style rule 4: "cursor at
    // board level → board bg tint"), which is visually "everything selected"
    // — the opposite of the user's intent.
    using app = createTestApp(
      item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { cols: 80, rows: 24 },
    )

    // Navigate to a card so we have a non-root selection to clear
    app.command("cursor_down")
    expect(app.state.cursor).not.toBe("board")

    // Find the first column's bounding box
    const col1 = app.q("[data-col-index='0'][data-column]")
    expect(col1.count()).toBeGreaterThan(0)
    const col1Box = col1.boundingBox()
    expect(col1Box).not.toBeNull()

    // Click in the EMPTY SPACE near the bottom of the column (well below the
    // last card and well below the header). The header is at row 0; cards take
    // a few rows; everything below is empty.
    app.click(col1Box!.x + 2, col1Box!.y + col1Box!.height - 1)

    // After clicking empty space, nothing should be selected. cursor=null so
    // the board doesn't get the "cursor at board level" tint (rule 4).
    expect(app.state.cursor).toBeNull()
    expect(app.state.cursor).not.toBe("Inbox")
    expect(app.state.cursor).not.toBe("board")
  })

  test("clicking the top bar chrome selects the board root", () => {
    // After a deselect-via-empty-space, the user needs a discoverable way to
    // re-enter "board level" (cursor=rootId, which tints the whole board).
    // Clicking the top-bar chrome (the white/breadcrumb row at the top of a
    // pane, data-view='top-bar') selects the board root.
    using app = createTestApp(
      item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { cols: 80, rows: 24 },
    )

    // Start somewhere that isn't the board root
    app.command("cursor_down")
    expect(app.state.cursor).not.toBe("board")

    // Find the top-bar chrome (PaneBar outer Box with data-view='top-bar')
    const topBar = app.q("[data-view='top-bar']")
    expect(topBar.count(), "top-bar should be rendered").toBeGreaterThan(0)
    const topBarBox = topBar.boundingBox()
    expect(topBarBox).not.toBeNull()

    // Click somewhere in the top-bar chrome (avoid the view-mode button on
    // the right, which has its own handler). Click near the left edge where
    // the breadcrumb path lives.
    app.click(topBarBox!.x + 1, topBarBox!.y)

    // Cursor should be on the board root
    expect(app.state.cursor).toBe("board")
  })

  test("clicking the view-mode button opens the filter/view dialog", () => {
    // The 'CARDS VIEW CL:3' text in the top bar (data-view='view-mode-button')
    // is a clickable control that opens the filter/view dialog — providing a
    // mouse path to the same action as the 'filter' keyboard command.
    using app = createTestApp(item.root("board", item("Inbox", item("task-1"), item("task-2"))), {
      cols: 80,
      rows: 24,
    })

    app.withStore((s) => expect(getActiveBoardPane(s)!.showFilterDialog).toBe(false))

    const viewModeBtn = app.q("[data-view='view-mode-button']")
    expect(viewModeBtn.count(), "view-mode-button should be rendered").toBeGreaterThan(0)
    const btnBox = viewModeBtn.boundingBox()
    expect(btnBox).not.toBeNull()

    // Click on the view-mode button
    app.click(btnBox!.x + 1, btnBox!.y)

    // Dialog should now be open
    app.withStore((s) => expect(getActiveBoardPane(s)!.showFilterDialog).toBe(true))
  })

  test("board-level commands still work when cursor is null (no invariant error)", () => {
    // Regression for km-tui.cursor-null-invariant: after deselecting via empty
    // space click, board-level commands (fold_all_more, etc.) must not throw
    // InvariantViolationError even though cursor is null on a non-empty board.
    // The invariant now recognizes sel.kind === "idle" as a legitimate null
    // cursor state.
    using app = createTestApp(
      item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { cols: 80, rows: 24 },
    )

    // Deselect via empty-space click
    const col1 = app.q("[data-col-index='0'][data-column]")
    const col1Box = col1.boundingBox()!
    app.click(col1Box.x + 2, col1Box.y + col1Box.height - 1)
    expect(app.state.cursor).toBeNull()

    // fold_all_more must NOT throw — it's board-level and doesn't need cursor
    expect(() => app.command("fold_all_more")).not.toThrow()

    // cursor still null (board-level op didn't restore selection)
    expect(app.state.cursor).toBeNull()
  })
})

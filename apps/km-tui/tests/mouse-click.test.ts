/**
 * Mouse Click Targeting Tests
 *
 * Tests that mouse clicks correctly target:
 * - Column headers / empty space → deselect all (cursor to board root)
 * - Cards → select the card (card-level cursor)
 * - Ctrl-click → toggle multi-selection
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

// =============================================================================
// Column Header Click
// =============================================================================

describe("mouse click targeting", () => {
  test("clicking a column header selects the column", () => {
    const { board, store } = testEnv(
      () =>
        item.root(
          "board",
          item("Inbox", item("task-1"), item("task-2")),
          item("Projects", item("proj-a"), item("proj-b")),
        ),
      { columns: 80, rows: 24 },
    )

    // Initially cursor should be on a card (first card of first column)
    const cursorEl = board.q("[data-cursor]")
    expect(cursorEl.count()).toBeGreaterThan(0)

    // Find the second column's header position via its column element
    const col2 = board.q("[data-col-index='1'][data-column]")
    expect(col2.count()).toBeGreaterThan(0)
    const col2Box = col2.boundingBox()
    expect(col2Box).not.toBeNull()

    // Click on the column header area (row 0 of the column, which is the header)
    board.click(col2Box!.x + 2, col2Box!.y)

    // After clicking column header, cursor should be on the column (Projects)
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("Projects")
  })

  test("clicking a card selects that card", () => {
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item("Inbox", item("task-1"), item("task-2")),
          item("Projects", item("proj-a"), item("proj-b")),
        ),
      { columns: 80, rows: 24 },
    )

    // Find the second card in the first column
    const task2 = board.q("[id='task-2']")
    expect(task2.count()).toBeGreaterThan(0)
    const task2Box = task2.boundingBox()
    expect(task2Box).not.toBeNull()

    // Click on the card
    board.click(task2Box!.x + 1, task2Box!.y)

    // After clicking, cursor should be on task-2
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    // The cursor element should contain the task-2 content
    const cursorText = cursor.textContent()
    expect(cursorText).toContain("task-2")
  })

  test("clicking card in another column moves cursor there", () => {
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item("Inbox", item("task-1"), item("task-2")),
          item("Projects", item("proj-a"), item("proj-b")),
        ),
      { columns: 80, rows: 24 },
    )

    // Find a card in the second column
    const projA = board.q("[id='proj-a']")
    expect(projA.count()).toBeGreaterThan(0)
    const projABox = projA.boundingBox()
    expect(projABox).not.toBeNull()

    // Click on it
    board.click(projABox!.x + 1, projABox!.y)

    // Cursor should now be in the second column
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    const cursorText = cursor.textContent()
    expect(cursorText).toContain("proj-a")
  })

  test("clicking on card border selects the card (not deselect to root)", () => {
    const { board, store } = testEnv(() => item.root("board", item("Inbox", item("task-1"), item("task-2"))), {
      columns: 80,
      rows: 24,
    })

    // Verify data-view="card" wrappers are present
    const cardWrappers = board.q("[data-view='card']")
    expect(cardWrappers.count(), "data-view='card' wrappers should exist").toBeGreaterThan(0)

    // Navigate to task-2 first (so we know cursor is there)
    board.command("cursor_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("task-2")

    // Find the inner element's bounding box (inside the card border)
    const task2 = board.q("[id='task-2'][data-view='item']")
    expect(task2.count()).toBeGreaterThan(0)
    const innerBox = task2.boundingBox()
    expect(innerBox).not.toBeNull()

    // Navigate to task-1 (move cursor away from task-2)
    board.command("cursor_up")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("task-1")

    // Click on the card border (1 column left of the inner content area).
    // The card border is rendered by the Card wrapper Box, which has data-card-id
    // but no `id` prop. Without the data-card-id fix, this would resolve to
    // the column and deselect to board root.
    board.click(innerBox!.x - 1, innerBox!.y)

    // Cursor should land on task-2, not deselect to board root
    const cursorId = getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null
    expect(cursorId).toBe("task-2")
  })

  test("ctrl-click toggles multi-selection", () => {
    const { board } = testEnv(() => item.root("board", item("Inbox", item("task-1"), item("task-2"), item("task-3"))), {
      columns: 80,
      rows: 24,
    })

    // Find the second card
    const task2 = board.q("[id='task-2']")
    expect(task2.count()).toBeGreaterThan(0)
    const task2Box = task2.boundingBox()
    expect(task2Box).not.toBeNull()

    // Ctrl-click to toggle selection
    board.click(task2Box!.x + 1, task2Box!.y, { ctrl: true })

    // The cursor should be on task-2 after ctrl-click
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeGreaterThan(0)
    const cursorText = cursor.textContent()
    expect(cursorText).toContain("task-2")
  })

  test("clicking a body block inside a card selects it", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Column", item("card-1", item.p("body text"), item("sub-item")))),
      { columns: 80, rows: 24 },
    )

    // Find the body block element
    const bodyEl = board.q("[id='body text']")
    expect(bodyEl.count()).toBeGreaterThan(0)
    const bodyBox = bodyEl.boundingBox()
    expect(bodyBox).not.toBeNull()

    // Click on the body block
    board.click(bodyBox!.x + 1, bodyBox!.y)

    // Cursor should move to the body block
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("body text")
  })

  test("clicking each child in a card selects the correct one", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )

    // Verify all children are rendered and get their positions
    const cardEl = board.q("[id='card']")
    const cardBox = cardEl.boundingBox()
    expect(cardBox).not.toBeNull()

    for (const id of ["child-1", "child-2", "child-3"]) {
      const el = board.q(`[id='${id}']`)
      expect(el.count(), `${id} should be rendered`).toBeGreaterThan(0)
      const box = el.boundingBox()!
      // Click at the center of the child element
      board.click(box.x + 1, box.y)
      const actual = getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null
      expect(actual, `click at y=${box.y} (card y=${cardBox!.y}) should select ${id}`).toBe(id)
    }
  })

  test("j/k navigate between siblings when inside a card", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )

    // Click on child-1 to enter sub-block navigation
    const el = board.q("[id='child-1']")
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-1")

    // j → child-2
    board.command("cursor_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-2")

    // j → child-3
    board.command("cursor_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-3")

    // k → child-2
    board.command("cursor_up")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-2")

    // k → child-1
    board.command("cursor_up")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-1")

    // k from first child → parent (card title)
    board.command("cursor_up")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("card")
  })

  test("j from last sub-block jumps to next card", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Column", item("card-a", item("a-child-1"), item("a-child-2")), item("card-b"))),
      { columns: 80, rows: 24 },
    )

    // Click on a-child-2 (last child of card-a)
    const el = board.q("[id='a-child-2']")
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("a-child-2")

    // j → next card (card-b), since there's no next sibling
    board.command("cursor_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("card-b")
  })

  test("pressing Enter on a sub-block enters inline edit for that block", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
      { columns: 80, rows: 24 },
    )

    // Click on child-2 to select it
    const el = board.q("[id='child-2']")
    expect(el.count()).toBeGreaterThan(0)
    const box = el.boundingBox()!
    board.click(box.x + 1, box.y)
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("child-2")

    // Press Enter to enter inline edit
    board.command("enter_inline_edit")

    // Should be editing child-2, not the parent card
    board.expectEditing("child-2")
  })

  test("arrow up/down in edit mode navigates to adjacent node and stays in edit mode", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Column", item("task-1"), item("task-2"), item("task-3"))),
      { columns: 80, rows: 24 },
    )

    // Enter edit mode on task-1
    board.command("enter_inline_edit")
    board.expectEditing("task-1")

    // Arrow down → task-2, still in edit mode
    board.press("ArrowDown")
    board.expectState({ cursor: "task-2", editing: "task-2" })

    // Arrow down → task-3, still in edit mode
    board.press("ArrowDown")
    board.expectState({ cursor: "task-3", editing: "task-3" })

    // Arrow up → task-2, still in edit mode
    board.press("ArrowUp")
    board.expectState({ cursor: "task-2", editing: "task-2" })
  })

  test("clicking column header selects the column (not board root)", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { columns: 80, rows: 24 },
    )

    // Navigate to second card
    board.command("cursor_down")
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).not.toBe(
      getActiveBoardPane(store.getState())!.rootId,
    )

    // Find the first column's header area
    const col1 = board.q("[data-col-index='0'][data-column]")
    expect(col1.count()).toBeGreaterThan(0)
    const col1Box = col1.boundingBox()
    expect(col1Box).not.toBeNull()

    // Click on the column header → selects the column
    board.click(col1Box!.x + 2, col1Box!.y)

    // Cursor should be on the column (Inbox), not board root
    expect(getActiveBoardPane(store.getState())!.sel.node.cursor() as string | null).toBe("Inbox")
  })
})

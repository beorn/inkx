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

// =============================================================================
// Column Header Click
// =============================================================================

describe("mouse click targeting", () => {
  test("clicking a column header deselects all cards (cursor to board root)", () => {
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

    // After clicking column background, cursor should be on the board root (no card selected)
    expect(store.getState().cursorNodeId).toBe(store.getState().rootId)
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

  test("clicking column header deselects card in same column", () => {
    const { board, store } = testEnv(
      () => item.root("board", item("Inbox", item("task-1"), item("task-2")), item("Projects", item("proj-a"))),
      { columns: 80, rows: 24 },
    )

    // Navigate to second card
    board.press("j")
    expect(store.getState().cursorNodeId).not.toBe(store.getState().rootId)

    // Find the first column's header area
    const col1 = board.q("[data-col-index='0'][data-column]")
    expect(col1.count()).toBeGreaterThan(0)
    const col1Box = col1.boundingBox()
    expect(col1Box).not.toBeNull()

    // Click on the column header → deselects to board root
    board.click(col1Box!.x + 2, col1Box!.y)

    // Cursor should be on board root (no card selected)
    expect(store.getState().cursorNodeId).toBe(store.getState().rootId)
  })
})

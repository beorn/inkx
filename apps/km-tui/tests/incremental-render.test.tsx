/**
 * Incremental Rendering Tests
 *
 * Verifies that buffer clone + subtree skip (incremental contentPhase)
 * doesn't leave stale pixels when cursor moves between cards.
 *
 * These tests use `incremental: true` to match live scheduler behavior.
 */
import { describe, expect, test } from "vitest"
import { item, testEnv } from "./helpers/board-test"

describe("incremental rendering", () => {
  test("cursor movement clears old highlight background", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a")),
        ),
      { incremental: true },
    )
    const app = board._result

    // Initial render: cursor should be on "1a"
    const cursor1 = app.locator("[data-cursor]")
    expect(cursor1.textContent()).toContain("1a")
    const box1 = cursor1.boundingBox()
    expect(box1).not.toBeNull()

    // Check initial cell bg at cursor position
    // The data-cursor Box has backgroundColor="yellow" (index 3)
    const cell1 = app.term.cell(box1!.x, box1!.y)
    expect(cell1.bg).toBe(3) // yellow = index 3

    // Move cursor down to "1b"
    board.press("j")

    // Cursor should now be on "1b"
    const cursor2 = app.locator("[data-cursor]")
    expect(cursor2.textContent()).toContain("1b")
    const box2 = cursor2.boundingBox()
    expect(box2).not.toBeNull()

    // New cursor should have yellow bg
    const cell2 = app.term.cell(box2!.x, box2!.y)
    expect(cell2.bg).toBe(3) // yellow = index 3

    // OLD cursor position should NOT have yellow bg (stale pixel check)
    const oldCell = app.term.cell(box1!.x, box1!.y)
    expect(oldCell.bg).not.toBe(3) // should NOT be yellow anymore
  })

  test("multiple cursor movements don't accumulate stale pixels", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a"), item("b"), item("c"), item("d")),
        ),
      { incremental: true },
    )
    const app = board._result

    // Collect positions as we move through items
    const positions: Array<{ x: number; y: number }> = []

    // Record initial cursor position
    const box0 = app.locator("[data-cursor]").boundingBox()!
    positions.push({ x: box0.x, y: box0.y })

    // Move down 3 times, recording each position
    for (let i = 0; i < 3; i++) {
      board.press("j")
      const box = app.locator("[data-cursor]").boundingBox()!
      positions.push({ x: box.x, y: box.y })
    }

    // Current cursor (on "d") should have yellow bg
    const currentCell = app.term.cell(positions[3]!.x, positions[3]!.y)
    expect(currentCell.bg).toBe(3)

    // ALL previous positions should NOT have yellow bg
    for (let i = 0; i < 3; i++) {
      const cell = app.term.cell(positions[i]!.x, positions[i]!.y)
      expect(cell.bg).not.toBe(3)
    }
  })

  test("cross-column cursor movement clears highlight", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
        ),
      { incremental: true },
    )
    const app = board._result

    // Cursor on col1/1a
    const box1 = app.locator("[data-cursor]").boundingBox()!
    expect(app.term.cell(box1.x, box1.y).bg).toBe(3)

    // Move right to col2
    board.press("l")
    const box2 = app.locator("[data-cursor]").boundingBox()!

    // col2 cursor highlighted, col1 old position cleared
    expect(app.term.cell(box2.x, box2.y).bg).toBe(3)
    expect(app.term.cell(box1.x, box1.y).bg).not.toBe(3)
  })

  test("scrolling within column clears stale highlights", () => {
    // Many items to force scrolling in a small viewport
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("a"),
            item("b"),
            item("c"),
            item("d"),
            item("e"),
            item("f"),
            item("g"),
            item("h"),
          ),
        ),
      { incremental: true, rows: 16 },
    )
    const app = board._result

    // Navigate down through all items, checking for stale yellow pixels
    for (let i = 0; i < 7; i++) {
      const cursorText = app.locator("[data-cursor]").textContent()
      const beforeBox = app.locator("[data-cursor]").boundingBox()!

      board.press("j")

      const afterCursorText = app.locator("[data-cursor]").textContent()
      const afterBox = app.locator("[data-cursor]").boundingBox()!

      // New cursor should be yellow
      expect(app.term.cell(afterBox.x, afterBox.y).bg).toBe(3)

      // Scan the ENTIRE visible area for stale yellow bg
      // Only the current cursor row should have yellow bg
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 80; x++) {
          const cell = app.term.cell(x, y)
          if (cell.bg === 3) {
            // This cell has yellow bg - it should be within the current cursor's bounds
            const inCursor =
              y >= afterBox.y &&
              y < afterBox.y + afterBox.height &&
              x >= afterBox.x &&
              x < afterBox.x + afterBox.width
            if (!inCursor) {
              // Log diagnostic info
              console.error(
                `Stale yellow pixel at (${x},${y}), cursor at (${afterBox.x},${afterBox.y} ${afterBox.width}x${afterBox.height})`,
                `step=${i}, moved ${cursorText} -> ${afterCursorText}`,
                `char="${cell.char}"`,
              )
              expect.fail(
                `Stale yellow bg at (${x},${y}) after moving cursor from "${cursorText}" to "${afterCursorText}"`,
              )
            }
          }
        }
      }
    }
  })

  test("scrolling in small viewport clears stale highlights", () => {
    // Force scrolling: many items in a tiny viewport
    // Cards are ~4 rows each, rows=12 fits ~2 cards
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("a"),
            item("b"),
            item("c"),
            item("d"),
            item("e"),
          ),
        ),
      { incremental: true, rows: 12 },
    )
    const app = board._result

    for (let i = 0; i < 4; i++) {
      board.press("j")

      const afterBox = app.locator("[data-cursor]").boundingBox()!

      // Full scan: no yellow bg outside current cursor bounds
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 80; x++) {
          const cell = app.term.cell(x, y)
          if (cell.bg === 3) {
            const inCursor =
              y >= afterBox.y &&
              y < afterBox.y + afterBox.height &&
              x >= afterBox.x &&
              x < afterBox.x + afterBox.width
            if (!inCursor) {
              expect.fail(
                `Stale yellow bg at (${x},${y}) step=${i}, cursor at (${afterBox.x},${afterBox.y} ${afterBox.width}x${afterBox.height}), char="${cell.char}"`,
              )
            }
          }
        }
      }
    }
  })

  test("cursor up also clears highlight", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
        ),
      { incremental: true },
    )
    const app = board._result

    // Record initial position
    const box1 = app.locator("[data-cursor]").boundingBox()!

    // Move down
    board.press("j")
    const box2 = app.locator("[data-cursor]").boundingBox()!

    // 1b highlighted, 1a not
    expect(app.term.cell(box2.x, box2.y).bg).toBe(3)
    expect(app.term.cell(box1.x, box1.y).bg).not.toBe(3)

    // Move back up
    board.press("k")

    // 1a highlighted again, 1b not
    expect(app.term.cell(box1.x, box1.y).bg).toBe(3)
    expect(app.term.cell(box2.x, box2.y).bg).not.toBe(3)
  })
})

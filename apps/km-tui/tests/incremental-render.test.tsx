/**
 * Incremental Rendering Tests
 *
 * Verifies that buffer clone + subtree skip (incremental renderPhase)
 * doesn't leave stale pixels when cursor moves between cards.
 *
 * These tests use `incremental: true` to match live scheduler behavior.
 */
import { describe, expect, test } from "vitest"
import React, { useState } from "react"
import { Box, Text, useInput, type Key } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"
import { item } from "./helpers/board-test"
import { createTestApp, type CellInfo } from "./helpers/test-app"
import { TC } from "./helpers/theme"

/** Deep-compare cell bg/fg (RGB objects) to a TC constant */
function colorEquals(a: CellInfo["fg"], b: { r: number; g: number; b: number }): boolean {
  if (a === null || a === undefined || typeof a === "number") return false
  return (
    typeof a === "object" &&
    (a as { r: number; g: number; b: number }).r === b.r &&
    (a as { r: number; g: number; b: number }).g === b.g &&
    (a as { r: number; g: number; b: number }).b === b.b
  )
}

describe("incremental rendering", () => {
  test("cursor movement clears old highlight background", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
      { incremental: true },
    )

    // Initial render: cursor should be on "1a"
    app.expect("#1a[data-cursor]").toExist()
    const box1 = app.q("#1a[data-cursor]").boundingBox()
    expect(box1).not.toBeNull()

    // Check initial cell bg at cursor position
    const cell1 = app.screen.cell(box1!.x, box1!.y)
    expect(colorEquals(cell1.bg, TC.$selected), "initial cursor bg should be $selected").toBe(true)

    // Move cursor down to "1b"
    app.command("cursor_down")

    // Cursor should now be on "1b"
    app.expect("#1b[data-cursor]").toExist()
    const box2 = app.q("#1b[data-cursor]").boundingBox()
    expect(box2).not.toBeNull()

    // New cursor should have $selected bg
    const cell2 = app.screen.cell(box2!.x, box2!.y)
    expect(colorEquals(cell2.bg, TC.$selected), "new cursor bg should be $selected").toBe(true)

    // OLD cursor position should NOT have $selected bg (stale pixel check)
    const oldCell = app.screen.cell(box1!.x, box1!.y)
    expect(colorEquals(oldCell.bg, TC.$selected), "old cursor position should be cleared").toBe(false)
  })

  test("multiple cursor movements don't accumulate stale pixels", () => {
    using app = createTestApp(item("board", item("col1", item("a"), item("b"), item("c"), item("d"))), {
      incremental: true,
    })

    // Collect positions as we move through items
    const positions: Array<{ x: number; y: number }> = []

    // Record initial cursor position
    const box0 = app.q("[data-cursor]").boundingBox()!
    positions.push({ x: box0.x, y: box0.y })

    // Move down 3 times, recording each position
    for (let i = 0; i < 3; i++) {
      app.command("cursor_down")
      const box = app.q("[data-cursor]").boundingBox()!
      positions.push({ x: box.x, y: box.y })
    }

    // Current cursor (on "d") should have $selected bg
    const currentCell = app.screen.cell(positions[3]!.x, positions[3]!.y)
    expect(colorEquals(currentCell.bg, TC.$selected), "current cursor should have $selected bg").toBe(true)

    // ALL previous positions should NOT have $selected bg
    for (let i = 0; i < 3; i++) {
      const cell = app.screen.cell(positions[i]!.x, positions[i]!.y)
      expect(colorEquals(cell.bg, TC.$selected), `position ${i} should not have stale $selected bg`).toBe(false)
    }
  })

  test("cross-column cursor movement clears highlight", () => {
    using app = createTestApp(
      item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
      { incremental: true },
    )

    // Cursor on col1/1a
    const box1 = app.q("[data-cursor]").boundingBox()!
    expect(colorEquals(app.screen.cell(box1.x, box1.y).bg, TC.$selected)).toBe(true)

    // Move right to col2
    app.command("cursor_right")
    const box2 = app.q("[data-cursor]").boundingBox()!

    // col2 cursor highlighted, col1 old position cleared
    expect(colorEquals(app.screen.cell(box2.x, box2.y).bg, TC.$selected)).toBe(true)
    expect(colorEquals(app.screen.cell(box1.x, box1.y).bg, TC.$selected)).toBe(false)
  })

  test("scrolling within column clears stale highlights", () => {
    // Many items to force scrolling in a small viewport
    using app = createTestApp(
      item(
        "board",
        item("col1", item("a"), item("b"), item("c"), item("d"), item("e"), item("f"), item("g"), item("h")),
      ),
      { incremental: true, rows: 16 },
    )

    // Navigate down through all items, checking for stale yellow pixels
    for (let i = 0; i < 7; i++) {
      const cursorText = app.q("[data-cursor]").textContent()

      app.command("cursor_down")

      const afterCursorText = app.q("[data-cursor]").textContent()
      const cursorNodeId = app.q("[data-cursor]").getAttribute("id")
      // Cursor-on-card paints the whole CARD with $selected bg, so measure
      // against the card's outer Box — not just the title row.
      const afterBox = app.q(`[data-card-id="${cursorNodeId}"]`).boundingBox()!

      // Cursor element should exist and have moved
      expect(afterBox).not.toBeNull()

      // Scan the ENTIRE visible area for stale $selected bg
      // Only cells within the current cursor CARD's bounds should have $selected bg.
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 80; x++) {
          const cell = app.screen.cell(x, y)
          if (colorEquals(cell.bg, TC.$selected)) {
            // This cell has $selected bg - it should be within the cursor card's bounds
            const inCursorArea =
              y >= afterBox.y && y < afterBox.y + afterBox.height && x >= afterBox.x && x < afterBox.x + afterBox.width
            if (!inCursorArea) {
              expect.fail(
                `Stale $selected bg at (${x},${y}) after moving cursor from "${cursorText}" to "${afterCursorText}"` +
                  `, cursor card at (${afterBox.x},${afterBox.y} ${afterBox.width}x${afterBox.height}), char="${cell.char}"`,
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
    using app = createTestApp(item("board", item("col1", item("a"), item("b"), item("c"), item("d"), item("e"))), {
      incremental: true,
      rows: 12,
    })

    for (let i = 0; i < 4; i++) {
      app.command("cursor_down")

      const cursorNodeId = app.q("[data-cursor]").getAttribute("id")
      const afterBox = app.q(`[data-card-id="${cursorNodeId}"]`).boundingBox()!

      // Full scan: no $selected bg outside current cursor card bounds
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 80; x++) {
          const cell = app.screen.cell(x, y)
          if (colorEquals(cell.bg, TC.$selected)) {
            const inCursor =
              y >= afterBox.y && y < afterBox.y + afterBox.height && x >= afterBox.x && x < afterBox.x + afterBox.width
            if (!inCursor) {
              expect.fail(
                `Stale $selected bg at (${x},${y}) step=${i}, cursor card at (${afterBox.x},${afterBox.y} ${afterBox.width}x${afterBox.height}), char="${cell.char}"`,
              )
            }
          }
        }
      }
    }
  })

  test("cursor up also clears highlight", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))), {
      incremental: true,
    })

    // Record initial position
    const box1 = app.q("[data-cursor]").boundingBox()!

    // Move down
    app.command("cursor_down")
    const box2 = app.q("[data-cursor]").boundingBox()!

    // 1b is now selected (data-cursor on 1b)
    expect(app.q("[data-cursor]").textContent()).toContain("1b")
    // Old position (1a) should NOT have $selected bg
    expect(colorEquals(app.screen.cell(box1.x, box1.y).bg, TC.$selected)).toBe(false)

    // Move back up
    app.command("cursor_up")

    // 1a is now selected again (data-cursor on 1a)
    expect(app.q("[data-cursor]").textContent()).toContain("1a")
    // Old position (1b) should NOT have $selected bg
    expect(colorEquals(app.screen.cell(box2.x, box2.y).bg, TC.$selected)).toBe(false)
  })
})

describe("incremental rendering: Text node backgroundColor", () => {
  const render = createRenderer({ cols: 40, rows: 10 })

  // ANSI 16-color palette index for yellow (createRenderer returns palette indices, not RGB)
  const YELLOW_INDEX = 3

  test("column-header-style Text bg clears when selection changes", () => {
    // Mimics column headers: <Text backgroundColor={selected ? "yellow" : undefined}>
    function ColumnHeaders() {
      const [selected, setSelected] = useState(0)

      useInput((input: string) => {
        if (input === "l") setSelected((s) => Math.min(2, s + 1))
        if (input === "h") setSelected((s) => Math.max(0, s - 1))
      })

      return (
        <Box flexDirection="row" width={40}>
          {["Todo", "Doing", "Done"].map((name, i) => (
            <Box key={i} width={13}>
              <Text backgroundColor={i === selected ? "yellow" : undefined}>{name}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<ColumnHeaders />, { incremental: true })

    // Initial: "Todo" header has yellow bg
    const todoBox = app.getByText("Todo").boundingBox()!
    const doingBox = app.getByText("Doing").boundingBox()!
    const doneBox = app.getByText("Done").boundingBox()!

    expect(app.term.cell(todoBox.x, todoBox.y).bg).toBe(YELLOW_INDEX)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).not.toBe(YELLOW_INDEX)

    // Move selection to "Doing"
    app.press("l")

    // "Todo" should be cleared, "Doing" should be yellow
    expect(app.term.cell(todoBox.x, todoBox.y).bg).not.toBe(YELLOW_INDEX)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).toBe(YELLOW_INDEX)
    expect(app.term.cell(doneBox.x, doneBox.y).bg).not.toBe(YELLOW_INDEX)

    // Move selection to "Done"
    app.press("l")

    expect(app.term.cell(todoBox.x, todoBox.y).bg).not.toBe(YELLOW_INDEX)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).not.toBe(YELLOW_INDEX)
    expect(app.term.cell(doneBox.x, doneBox.y).bg).toBe(YELLOW_INDEX)

    // Move back to "Todo"
    app.press("h")
    app.press("h")

    expect(app.term.cell(todoBox.x, todoBox.y).bg).toBe(YELLOW_INDEX)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).not.toBe(YELLOW_INDEX)
    expect(app.term.cell(doneBox.x, doneBox.y).bg).not.toBe(YELLOW_INDEX)
  })
})

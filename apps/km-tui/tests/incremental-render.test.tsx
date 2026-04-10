/**
 * Incremental Rendering Tests
 *
 * FREEZE: entire file uses testEnv — all tests access board._result.term.cell()
 * and board._result.locator() for buffer-level incremental rendering assertions.
 * Also uses palette color indices (TC.$selected) which resolve to truecolor in createTestApp.
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
import { item, testEnv } from "./helpers/board-test"
import { TC } from "./helpers/theme"

describe("incremental rendering", () => {
  test("cursor movement clears old highlight background", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
      { incremental: true },
    )
    const app = board._result

    // Initial render: cursor should be on "1a"
    const cursor1 = app.locator("[data-cursor]")
    expect(cursor1.textContent()).toContain("1a")
    const box1 = cursor1.boundingBox()
    expect(box1).not.toBeNull()

    // Check initial cell bg at cursor position
    // The data-cursor Box has backgroundColor="$selected"
    const cell1 = app.term.cell(box1!.x, box1!.y)
    expect(cell1.bg).toBe(TC.$selected)

    // Move cursor down to "1b"
    board.command("cursor_down")

    // Cursor should now be on "1b"
    const cursor2 = app.locator("[data-cursor]")
    expect(cursor2.textContent()).toContain("1b")
    const box2 = cursor2.boundingBox()
    expect(box2).not.toBeNull()

    // New cursor should have $selected bg
    const cell2 = app.term.cell(box2!.x, box2!.y)
    expect(cell2.bg).toBe(TC.$selected)

    // OLD cursor position should NOT have $selected bg (stale pixel check)
    const oldCell = app.term.cell(box1!.x, box1!.y)
    expect(oldCell.bg).not.toBe(TC.$selected)
  })

  test("multiple cursor movements don't accumulate stale pixels", () => {
    const { board } = testEnv(() => item("board", item("col1", item("a"), item("b"), item("c"), item("d"))), {
      incremental: true,
    })
    const app = board._result

    // Collect positions as we move through items
    const positions: Array<{ x: number; y: number }> = []

    // Record initial cursor position
    const box0 = app.locator("[data-cursor]").boundingBox()!
    positions.push({ x: box0.x, y: box0.y })

    // Move down 3 times, recording each position
    for (let i = 0; i < 3; i++) {
      board.command("cursor_down")
      const box = app.locator("[data-cursor]").boundingBox()!
      positions.push({ x: box.x, y: box.y })
    }

    // Current cursor (on "d") should have $selected bg
    const currentCell = app.term.cell(positions[3]!.x, positions[3]!.y)
    expect(currentCell.bg).toBe(TC.$selected)

    // ALL previous positions should NOT have $selected bg
    for (let i = 0; i < 3; i++) {
      const cell = app.term.cell(positions[i]!.x, positions[i]!.y)
      expect(cell.bg).not.toBe(TC.$selected)
    }
  })

  test("cross-column cursor movement clears highlight", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
      { incremental: true },
    )
    const app = board._result

    // Cursor on col1/1a
    const box1 = app.locator("[data-cursor]").boundingBox()!
    expect(app.term.cell(box1.x, box1.y).bg).toBe(TC.$selected)

    // Move right to col2
    board.command("cursor_right")
    const box2 = app.locator("[data-cursor]").boundingBox()!

    // col2 cursor highlighted, col1 old position cleared
    expect(app.term.cell(box2.x, box2.y).bg).toBe(TC.$selected)
    expect(app.term.cell(box1.x, box1.y).bg).not.toBe(TC.$selected)
  })

  test("scrolling within column clears stale highlights", () => {
    // Many items to force scrolling in a small viewport
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a"), item("b"), item("c"), item("d"), item("e"), item("f"), item("g"), item("h")),
        ),
      { incremental: true, rows: 16 },
    )
    const app = board._result

    // Navigate down through all items, checking for stale yellow pixels
    for (let i = 0; i < 7; i++) {
      const cursorText = app.locator("[data-cursor]").textContent()

      board.command("cursor_down")

      const afterCursorText = app.locator("[data-cursor]").textContent()
      const afterBox = app.locator("[data-cursor]").boundingBox()!

      // Cursor element should exist and have moved
      expect(afterBox).not.toBeNull()

      // Scan the ENTIRE visible area for stale $selected bg
      // Only cells within the current cursor's bounds should have $selected bg.
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 80; x++) {
          const cell = app.term.cell(x, y)
          if (cell.bg === TC.$selected) {
            // This cell has $selected bg - it should be within the cursor bounds
            const inCursorArea =
              y >= afterBox.y && y < afterBox.y + afterBox.height && x >= afterBox.x && x < afterBox.x + afterBox.width
            if (!inCursorArea) {
              expect.fail(
                `Stale $selected bg at (${x},${y}) after moving cursor from "${cursorText}" to "${afterCursorText}"` +
                  `, cursor at (${afterBox.x},${afterBox.y} ${afterBox.width}x${afterBox.height}), char="${cell.char}"`,
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
      () => item("board", item("col1", item("a"), item("b"), item("c"), item("d"), item("e"))),
      { incremental: true, rows: 12 },
    )
    const app = board._result

    for (let i = 0; i < 4; i++) {
      board.command("cursor_down")

      const afterBox = app.locator("[data-cursor]").boundingBox()!

      // Full scan: no $selected bg outside current cursor bounds
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 80; x++) {
          const cell = app.term.cell(x, y)
          if (cell.bg === TC.$selected) {
            const inCursor =
              y >= afterBox.y && y < afterBox.y + afterBox.height && x >= afterBox.x && x < afterBox.x + afterBox.width
            if (!inCursor) {
              expect.fail(
                `Stale $selected bg at (${x},${y}) step=${i}, cursor at (${afterBox.x},${afterBox.y} ${afterBox.width}x${afterBox.height}), char="${cell.char}"`,
              )
            }
          }
        }
      }
    }
  })

  test("cursor up also clears highlight", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))), {
      incremental: true,
    })
    const app = board._result

    // Record initial position
    const box1 = app.locator("[data-cursor]").boundingBox()!

    // Move down
    board.command("cursor_down")
    const box2 = app.locator("[data-cursor]").boundingBox()!

    // 1b is now selected (data-cursor on 1b)
    expect(app.locator("[data-cursor]").textContent()).toContain("1b")
    // Old position (1a) should NOT have $selected bg
    expect(app.term.cell(box1.x, box1.y).bg).not.toBe(TC.$selected)

    // Move back up
    board.command("cursor_up")

    // 1a is now selected again (data-cursor on 1a)
    expect(app.locator("[data-cursor]").textContent()).toContain("1a")
    // Old position (1b) should NOT have $selected bg
    expect(app.term.cell(box2.x, box2.y).bg).not.toBe(TC.$selected)
  })
})

describe("incremental rendering: Text node backgroundColor", () => {
  const render = createRenderer({ cols: 40, rows: 10 })

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

    expect(app.term.cell(todoBox.x, todoBox.y).bg).toBe(TC.$selected)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).not.toBe(TC.$selected)

    // Move selection to "Doing"
    app.press("l")

    // "Todo" $selected should be cleared, "Doing" should be $selected
    expect(app.term.cell(todoBox.x, todoBox.y).bg).not.toBe(TC.$selected)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).toBe(TC.$selected)
    expect(app.term.cell(doneBox.x, doneBox.y).bg).not.toBe(TC.$selected)

    // Move selection to "Done"
    app.press("l")

    expect(app.term.cell(todoBox.x, todoBox.y).bg).not.toBe(TC.$selected)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).not.toBe(TC.$selected)
    expect(app.term.cell(doneBox.x, doneBox.y).bg).toBe(TC.$selected)

    // Move back to "Todo"
    app.press("h")
    app.press("h")

    expect(app.term.cell(todoBox.x, todoBox.y).bg).toBe(TC.$selected)
    expect(app.term.cell(doingBox.x, doingBox.y).bg).not.toBe(TC.$selected)
    expect(app.term.cell(doneBox.x, doneBox.y).bg).not.toBe(TC.$selected)
  })
})

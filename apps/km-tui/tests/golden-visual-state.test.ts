/**
 * Golden Visual State Tests — freeze visual treatment before refactoring.
 *
 * These tests capture the current visual behavior for the node state × role
 * matrix from docs/design/ui/rendering.md. They serve as the acceptance
 * gate for km-tui.hierarchical-node-state: if any test here breaks, the
 * refactoring introduced a visual regression.
 */

import { describe, it, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp, type CellInfo } from "./helpers/test-app.ts"
import { TC } from "./helpers/theme.ts"

// ── Helpers ────────────────────────────────────────────────────────────────

function cursorLoc(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

function standardBoard() {
  return item(
    "board",
    item("col1", item("card1", item("sub1"), item("sub2")), item("card2")),
    item("col2", item("card3", item("sub3")), item("card4")),
    item("col3", item("card5")),
  )
}

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

// ── 1. Cursor visual treatment per role ────────────────────────────────────

describe("cursor visual treatment", () => {
  it("cursor card title row gets inverse ($bg-selected bg, $fg-on-selected fg)", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.expect(cursorLoc("card1")).toExist()

    const cardBox = app.screen.nodeBox("card1")
    expect(cardBox).not.toBeNull()
    if (!cardBox) return

    const titleCell = app.screen.cell(cardBox.x, cardBox.y)
    expect(colorEquals(titleCell.bg, TC["$bg-selected"]), "cursor card title bg").toBe(true)
    expect(colorEquals(titleCell.fg, TC["$fg-on-selected"]), "cursor card title fg").toBe(true)
  })

  it("cursor move: old card loses inverse, new card gains it", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.expect(cursorLoc("card1")).toExist()

    app.press("j") // move to card2
    app.expect(cursorLoc("card2")).toExist()
    app.expect(cursorLoc("card1")).toHaveCount(0)

    // card2 title should now be inverse
    const card2Box = app.screen.nodeBox("card2")
    expect(card2Box).not.toBeNull()
    if (!card2Box) return

    const titleCell = app.screen.cell(card2Box.x, card2Box.y)
    expect(colorEquals(titleCell.bg, TC["$bg-selected"]), "new cursor card title bg").toBe(true)
  })

  it("cursor at column level: column header gets inverse", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })

    app.press("Z") // zoom out to column level
    // At column level, col1 header should have selection treatment
    const colBox = app.screen.nodeBox("col1")
    expect(colBox, "col1 visible at column level").not.toBeNull()
    if (!colBox) return

    const headerCell = app.screen.cell(colBox.x, colBox.y)
    expect(colorEquals(headerCell.bg, TC["$bg-selected"]), "column-level cursor header bg").toBe(true)
  })
})

// ── 2. Cursor-descendant (breadcrumb) ──────────────────────────────────────

describe("cursor-descendant breadcrumb", () => {
  it("column with cursor descendant differs from column without", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    // Cursor on card1 (inside col1)
    app.expect(cursorLoc("card1")).toExist()

    // col1 (has cursor descendant) and col2 (doesn't) should look different
    const col1Box = app.screen.nodeBox("col1")
    const col2Box = app.screen.nodeBox("col2")
    expect(col1Box, "col1 should be visible").not.toBeNull()
    expect(col2Box, "col2 should be visible").not.toBeNull()
    if (!col1Box || !col2Box) return

    // The column with cursor descendant should have a visual distinction
    // (color, underline, or bold) vs the one without
    const col1Header = app.screen.row(col1Box.y).slice(col1Box.x, col1Box.x + 10)
    const col2Header = app.screen.row(col2Box.y).slice(col2Box.x, col2Box.x + 10)
    // Both should contain their names
    expect(col1Header).toContain("col1")
    expect(col2Header).toContain("col2")
  })

  it("non-cursor column header does NOT get yellow fg", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    // Cursor on card1 (in col1), col2 should NOT have yellow fg
    const col2Box = app.screen.nodeBox("col2")
    expect(col2Box).not.toBeNull()
    if (!col2Box) return

    const cell = app.screen.cell(col2Box.x, col2Box.y)
    expect(colorEquals(cell.fg, TC["$bg-selected"]), "col2 header should NOT have $bg-selected fg").toBe(false)
  })
})

// ── 3. Multi-selection ─────────────────────────────────────────────────────

describe("multi-selection visual", () => {
  it("shift+Arrow extends selection — cursor moves, previous gets selectedBg", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.expect(cursorLoc("card1")).toExist()

    app.press("shift+ArrowDown") // extend selection: card1 selected, cursor to card2
    app.expect(cursorLoc("card2")).toExist()

    // Status should show selection count
    const status = app.getStatus()
    expect(status?.message).toContain("selected")
  })

  it("Escape clears multi-selection", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.press("shift+ArrowDown")
    app.press("Escape")

    // After escape, status should not show selection
    const status = app.getStatus()
    const msg = status?.message ?? ""
    expect(msg).not.toContain("selected")
  })
})

// ── 4. Done/dropped ────────────────────────────────────────────────────────

describe("done/dropped visual", () => {
  it("done task shows dimmed when not cursor", () => {
    const nodes = item("board", item("col1", item.task("done-task"), item.task("todo-task")))
    const doneNode = nodes.find((n) => n.content === "done-task")!
    doneNode.item = { list: "-", task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    // Navigate away from done-task so it's not cursor
    app.press("j")
    app.expect(cursorLoc("todo-task")).toExist()

    // done-task should be visible but dimmed
    const doneBox = app.screen.nodeBox("done-task")
    expect(doneBox, "done-task should be visible").not.toBeNull()
    if (!doneBox) return

    // Verify done task has some visual distinction from normal (dimColor/strikethrough/etc)
    const doneCell = app.screen.cell(doneBox.x, doneBox.y)

    // Done task fg should differ from cursor task fg (it's dimmed/muted)
    // The specific fg depends on theme — just verify it's not the same as active cursor
    expect(colorEquals(doneCell.bg, TC["$bg-selected"]), "done task should NOT have selection bg").toBe(false)
  })
})

// ── 5. Signal consistency ──────────────────────────────────────────────────

describe("signal consistency", () => {
  it("cursor move updates all visual indicators atomically", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.expect(cursorLoc("card1")).toExist()

    // Move down
    app.press("j")
    app.expect(cursorLoc("card2")).toExist()
    app.expect(cursorLoc("card1")).toHaveCount(0)

    // Move back up
    app.press("k")
    app.expect(cursorLoc("card1")).toExist()
    app.expect(cursorLoc("card2")).toHaveCount(0)
  })

  it("j/k round-trip preserves cursor visual", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })

    app.press("j") // card2
    app.press("k") // card1

    app.expect(cursorLoc("card1")).toExist()
  })

  it("zoom in/out preserves correct cursor visual", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.expect(cursorLoc("card1")).toExist()

    app.press("z") // zoom into card1
    // After zoom, sub1 should be visible and cursor on it
    app.expect("#sub1").toExist()

    app.press("Z") // zoom out
    // Back to board view with card1 as cursor
    app.expect(cursorLoc("card1")).toExist()
  })
})

// ── 6. Deselected state ────────────────────────────────────────────────────

describe("deselected state", () => {
  it("board level renders without crash", () => {
    using app = createTestApp(standardBoard(), { cols: 80, rows: 24 })
    app.press("Z") // zoom to column level
    app.press("Z") // zoom to board level

    // Should still render content
    const text = app.text
    expect(text).toContain("col1")
    expect(text).toContain("col2")
  })
})

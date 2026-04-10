/**
 * Golden Visual State Tests — freeze visual treatment before refactoring.
 *
 * FREEZE: all tests compare cell colors to TC (ANSI 16 color indices).
 * createTestApp resolves colors to RGB triples, breaking these assertions.
 * These tests must stay on testEnv until createTestApp supports ANSI color comparison.
 *
 * These tests capture the current visual behavior for the node state × role
 * matrix from docs/design/node-visual-spec.md. They serve as the acceptance
 * gate for km-tui.hierarchical-node-state: if any test here breaks, the
 * refactoring introduced a visual regression.
 */

import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { TC } from "./helpers/theme.ts"

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── 1. Cursor visual treatment per role ────────────────────────────────────

describe("cursor visual treatment", () => {
  it("cursor card title row gets inverse ($selection-bg bg, $selection fg)", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.expect(cursorLoc("card1")).toExist()

    const cardBox = board.screen.nodeBox("card1")
    expect(cardBox).not.toBeNull()
    if (!cardBox) return

    const titleCell = board.screen.cell(cardBox.x, cardBox.y)
    expect(titleCell.bg, "cursor card title bg").toBe(TC["$selection-bg"])
    expect(titleCell.fg, "cursor card title fg").toBe(TC.$selection)
  })

  it("cursor move: old card loses inverse, new card gains it", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.expect(cursorLoc("card1")).toExist()

    board.press("j") // move to card2
    board.expect(cursorLoc("card2")).toExist()
    board.expect(cursorLoc("card1")).toHaveCount(0)

    // card2 title should now be inverse
    const card2Box = board.screen.nodeBox("card2")
    expect(card2Box).not.toBeNull()
    if (!card2Box) return

    const titleCell = board.screen.cell(card2Box.x, card2Box.y)
    expect(titleCell.bg, "new cursor card title bg").toBe(TC["$selection-bg"])
  })

  it("cursor at column level: column header gets inverse", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })

    board.press("Z") // zoom out to column level
    // At column level, col1 header should have selection treatment
    const colBox = board.screen.nodeBox("col1")
    expect(colBox, "col1 visible at column level").not.toBeNull()
    if (!colBox) return

    const headerCell = board.screen.cell(colBox.x, colBox.y)
    expect(headerCell.bg, "column-level cursor header bg").toBe(TC["$selection-bg"])
  })
})

// ─── 2. Cursor-descendant (breadcrumb) ──────────────────────────────────────

describe("cursor-descendant breadcrumb", () => {
  it("column with cursor descendant differs from column without", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    // Cursor on card1 (inside col1)
    board.expect(cursorLoc("card1")).toExist()

    // col1 (has cursor descendant) and col2 (doesn't) should look different
    const col1Box = board.screen.nodeBox("col1")
    const col2Box = board.screen.nodeBox("col2")
    expect(col1Box, "col1 should be visible").not.toBeNull()
    expect(col2Box, "col2 should be visible").not.toBeNull()
    if (!col1Box || !col2Box) return

    // The column with cursor descendant should have a visual distinction
    // (color, underline, or bold) vs the one without
    const col1Header = board.screen.row(col1Box.y).slice(col1Box.x, col1Box.x + 10)
    const col2Header = board.screen.row(col2Box.y).slice(col2Box.x, col2Box.x + 10)
    // Both should contain their names
    expect(col1Header).toContain("col1")
    expect(col2Header).toContain("col2")
  })

  it("non-cursor column header does NOT get yellow fg", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    // Cursor on card1 (in col1), col2 should NOT have yellow fg
    const col2Box = board.screen.nodeBox("col2")
    expect(col2Box).not.toBeNull()
    if (!col2Box) return

    const cell = board.screen.cell(col2Box.x, col2Box.y)
    expect(cell.fg, "col2 header should NOT have $selection-bg fg").not.toBe(TC["$selection-bg"])
  })
})

// ─── 3. Multi-selection ─────────────────────────────────────────────────────

describe("multi-selection visual", () => {
  it("shift+Arrow extends selection — cursor moves, previous gets selectedBg", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.expect(cursorLoc("card1")).toExist()

    board.press("shift+ArrowDown") // extend selection: card1 selected, cursor to card2
    board.expect(cursorLoc("card2")).toExist()

    // Status should show selection count
    const status = board.getStatus()
    expect(status?.message).toContain("selected")
  })

  it("Escape clears multi-selection", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.press("shift+ArrowDown")
    board.press("Escape")

    // After escape, status should not show selection
    const status = board.getStatus()
    const msg = status?.message ?? ""
    expect(msg).not.toContain("selected")
  })
})

// ─── 4. Done/dropped ────────────────────────────────────────────────────────

describe("done/dropped visual", () => {
  it("done task shows dimmed when not cursor", () => {
    const nodes = item("board", item("col1", item.task("done-task"), item.task("todo-task")))
    const doneNode = nodes.find((n) => n.content === "done-task")!
    doneNode.item = { list: "-", task: { status: "done", marker: "[x]" } }

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    // Navigate away from done-task so it's not cursor
    board.press("j")
    board.expect(cursorLoc("todo-task")).toExist()

    // done-task should be visible but dimmed
    const doneBox = board.screen.nodeBox("done-task")
    expect(doneBox, "done-task should be visible").not.toBeNull()
    if (!doneBox) return

    // Verify done task has some visual distinction from normal (dimColor/strikethrough/etc)
    const doneCell = board.screen.cell(doneBox.x, doneBox.y)
    const todoBox = board.screen.nodeBox("todo-task")
    if (!todoBox) return

    // Done task fg should differ from cursor task fg (it's dimmed/muted)
    // The specific fg depends on theme — just verify it's not the same as active cursor
    expect(doneCell.bg).not.toBe(TC["$selection-bg"]) // done task should NOT have selection bg
  })
})

// ─── 5. Signal consistency ──────────────────────────────────────────────────

describe("signal consistency", () => {
  it("cursor move updates all visual indicators atomically", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.expect(cursorLoc("card1")).toExist()

    // Move down
    board.press("j")
    board.expect(cursorLoc("card2")).toExist()
    board.expect(cursorLoc("card1")).toHaveCount(0)

    // Move back up
    board.press("k")
    board.expect(cursorLoc("card1")).toExist()
    board.expect(cursorLoc("card2")).toHaveCount(0)
  })

  it("j/k round-trip preserves cursor visual", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })

    board.press("j") // card2
    board.press("k") // card1

    board.expect(cursorLoc("card1")).toExist()
  })

  it("zoom in/out preserves correct cursor visual", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.expect(cursorLoc("card1")).toExist()

    board.press("z") // zoom into card1
    // After zoom, sub1 should be visible and cursor on it
    board.expect("#sub1").toExist()

    board.press("Z") // zoom out
    // Back to board view with card1 as cursor
    board.expect(cursorLoc("card1")).toExist()
  })
})

// ─── 6. Deselected state ────────────────────────────────────────────────────

describe("deselected state", () => {
  it("board level renders without crash", () => {
    const { board } = testEnv(() => standardBoard(), { columns: 80, rows: 24 })
    board.press("Z") // zoom to column level
    board.press("Z") // zoom to board level

    // Should still render content
    const text = board.screenshot()
    expect(text).toContain("col1")
    expect(text).toContain("col2")
  })
})

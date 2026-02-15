/**
 * Verification: km-tui.selected-color
 *
 * Bug: when a card with dates is selected, ALL text should be black-on-yellow.
 * Date badge and info suffix may render with wrong colors.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"

describe("selected card color (km-tui.selected-color)", () => {
  test("selected card with date has black-on-yellow for main text", () => {
    const nodes = item("board",
      item("col1",
        item.task("My Task"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "My Task")!
    taskNode.due_date = "2026-04-15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Cursor should be on "My Task"
    board.expect('[id="My Task"][data-cursor]').toExist()

    // Check main text color — should be black (0) on yellow (3)
    board.expectNodeColor("My Task", { fg: 0, bg: 3 })
  })

  test("selected card with date has black-on-yellow for date badge", () => {
    const nodes = item("board",
      item("col1",
        item.task("Dated Task"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "Dated Task")!
    taskNode.due_date = "2026-04-15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.expect('[id="Dated Task"][data-cursor]').toExist()

    // Find where "Apr" is rendered
    const nodeBox = board.screen.nodeBox("Dated Task")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const aprIdx = row.indexOf("Apr")
    expect(aprIdx, "date badge 'Apr' should be visible").toBeGreaterThan(-1)

    // Date badge text should be black (0) on yellow (3) when selected
    const cell = board.screen.cell(aprIdx, nodeBox.y)
    expect(cell.fg, "date badge fg should be black").toEqual(0)
    expect(cell.bg, "date badge bg should be yellow").toEqual(3)
  })

  test("selected card with priority has black-on-yellow for priority badge", () => {
    const nodes = item("board",
      item("col1",
        item.task("Priority Task"),
      ),
    )
    const taskNode = nodes.find((n) => n.content === "Priority Task")!
    taskNode.priority = 1

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.expect('[id="Priority Task"][data-cursor]').toExist()

    // Find where "P1" is rendered
    const nodeBox = board.screen.nodeBox("Priority Task")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const p1Idx = row.indexOf("P1")
    expect(p1Idx, "priority badge 'P1' should be visible").toBeGreaterThan(-1)

    // Priority badge should be black (0) on yellow (3) when selected
    const cell = board.screen.cell(p1Idx, nodeBox.y)
    expect(cell.fg, "priority fg should be black").toEqual(0)
    expect(cell.bg, "priority bg should be yellow").toEqual(3)
  })

  test("non-selected card does NOT have yellow bg", () => {
    const nodes = item("board",
      item("col1",
        item.task("First"),
        item.task("Second"),
      ),
    )
    const secondTask = nodes.find((n) => n.content === "Second")!
    secondTask.due_date = "2026-04-15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Cursor on First, Second is NOT selected
    board.expect("#First[data-cursor]").toExist()

    const nodeBox = board.screen.nodeBox("Second")
    expect(nodeBox).not.toBeNull()
    if (!nodeBox) return

    // Check that the non-selected card does NOT have yellow bg
    for (let x = nodeBox.x; x < nodeBox.x + nodeBox.width; x++) {
      const cell = board.screen.cell(x, nodeBox.y)
      if (cell.char.trim() === "") continue
      expect(cell.bg, `non-selected cell at (${x},${nodeBox.y}) should not be yellow`).not.toEqual(3)
      break
    }
  })
})

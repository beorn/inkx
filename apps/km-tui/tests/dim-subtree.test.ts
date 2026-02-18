/**
 * Tests that children of done/dropped tasks are dimmed.
 *
 * When a parent task has done/dropped status, its body content
 * and sub-items should also render with dim styling.
 */

import { describe, it, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("dim-subtree: children of done/dropped tasks are dimmed", () => {
  it("done task's sub-items are dimmed in outline view", () => {
    // Create a folder with children, then mark it as done task
    const nodes = item("board", item("col1", item("doneParent", item("child1"), item("child2"))))
    const parent = nodes.find((n) => n.id === "doneParent")!
    parent.task_status = "done"
    parent.task_marker = "[x]"
    parent.list_marker = "-"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Use Tab to expand the card outline so children are visible
    board.press("Tab")

    const shot = board.screenshot()
    expect(shot, "screenshot should contain child1").toContain("child1")

    const childBox = board.screen.nodeBox("child1")
    expect(childBox, "child1 should have a nodeBox").not.toBeNull()
    if (!childBox) return

    const row = board.screen.row(childBox.y)
    const childIdx = row.indexOf("child1")
    expect(childIdx, "child1 text should be in the row").toBeGreaterThan(-1)

    const cell = board.screen.cell(childIdx, childBox.y)
    expect(cell.attrs.dim, "child of done task should be dimmed").toBe(true)
  })

  it("dropped task's sub-items are dimmed", () => {
    const nodes = item("board", item("col1", item("droppedParent", item("child1"))))
    const parent = nodes.find((n) => n.id === "droppedParent")!
    parent.task_status = "dropped"
    parent.task_marker = "[-]"
    parent.list_marker = "-"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.press("Tab")

    const childBox = board.screen.nodeBox("child1")
    expect(childBox, "child1 should be visible").not.toBeNull()
    if (!childBox) return

    const row = board.screen.row(childBox.y)
    const childIdx = row.indexOf("child1")
    expect(childIdx).toBeGreaterThan(-1)

    const cell = board.screen.cell(childIdx, childBox.y)
    expect(cell.attrs.dim, "child of dropped task should be dimmed").toBe(true)
  })

  it("open task's sub-items are NOT dimmed when parent is selected", () => {
    const nodes = item("board", item("col1", item("openParent", item("child1"))))

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.press("Tab")

    const childBox = board.screen.nodeBox("child1")
    expect(childBox, "child1 should be visible").not.toBeNull()
    if (!childBox) return

    const row = board.screen.row(childBox.y)
    const childIdx = row.indexOf("child1")
    expect(childIdx).toBeGreaterThan(-1)

    const cell = board.screen.cell(childIdx, childBox.y)
    expect(cell.attrs.dim, "child of open task should not be dimmed").toBeFalsy()
  })

  it("done task's title itself is dimmed (non-selected)", () => {
    const nodes = item("board", item("col1", item("doneParent", item("child1")), item.task("otherTask")))
    const parent = nodes.find((n) => n.id === "doneParent")!
    parent.task_status = "done"
    parent.task_marker = "[x]"
    parent.list_marker = "-"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Move cursor to otherTask so doneParent is not selected
    board.press("j")

    const nodeBox = board.screen.nodeBox("doneParent")
    expect(nodeBox, "doneParent should be visible").not.toBeNull()
    if (!nodeBox) return

    const row = board.screen.row(nodeBox.y)
    const titleIdx = row.indexOf("doneParent")
    expect(titleIdx).toBeGreaterThan(-1)

    const cell = board.screen.cell(titleIdx, nodeBox.y)
    expect(cell.attrs.dim, "done task title should be dimmed").toBe(true)
  })
})

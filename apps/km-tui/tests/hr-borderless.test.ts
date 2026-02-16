import { test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

test("HR card renders without border", () => {
  const { board } = testEnv(() =>
    item("board", item("col", item("task1"), item.hr("my-hr"), item("task2")))
  )

  // HR should not have card border chars (╭╮╰╯│)
  board.expectNodeNoBorder("my-hr")
})

test("neighboring cards still have borders", () => {
  const { board } = testEnv(() =>
    item("board", item("col", item("task1"), item.hr("my-hr"), item("task2")))
  )
  const task1Box = board.screen.nodeBox("task1")
  expect(task1Box).not.toBeNull()
  if (task1Box) {
    // Round border: row above task1 content should have ╭
    const topBorderRow = task1Box.y - 1
    if (topBorderRow >= 0) {
      const topLeftCell = board.screen.cell(task1Box.x - 1, topBorderRow)
      expect("╭╮╰╯│┌┐└┘".includes(topLeftCell.char), `task1 top border: got "${topLeftCell.char}"`).toBe(true)
    }
  }
})

test("HR renders centered content (---) within card width", () => {
  const { board } = testEnv(() =>
    item("board", item("col", item.hr("my-hr")))
  )
  // Use nodeBox to find the HR's actual position
  const hrBox = board.screen.nodeBox("my-hr")
  expect(hrBox, "HR node should be visible").not.toBeNull()
  if (hrBox) {
    // HR content "---" is centered with spaces — find it in the row
    let rowText = ""
    for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
      rowText += board.screen.cell(x, hrBox.y).char
    }
    expect(rowText).toContain("---")
  }
})

test("selected HR is yellow", () => {
  const { board } = testEnv(() =>
    item("board", item("col", item.hr("my-hr")))
  )
  // HR should be selected by default (first card)
  const hrBox = board.screen.nodeBox("my-hr")
  expect(hrBox, "HR node should be visible").not.toBeNull()
  if (hrBox) {
    // Find the "---" content within the centered row
    let dashX = -1
    for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
      if (board.screen.cell(x, hrBox.y).char === "-") { dashX = x; break }
    }
    expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
    const cell = board.screen.cell(dashX, hrBox.y)
    // Should be yellow (color 3) when selected
    expect(cell.fg, "selected HR should be yellow").toBe(3)
    expect(cell.attrs.dim, "selected HR should not be dim").toBeFalsy()
  }
})

test("unselected HR is dimmed", () => {
  const { board } = testEnv(() =>
    item("board", item("col", item("task1"), item.hr("my-hr")))
  )
  // task1 is selected by default, HR is not selected
  const hrBox = board.screen.nodeBox("my-hr")
  expect(hrBox, "HR node should be visible").not.toBeNull()
  if (hrBox) {
    // Find the "---" content within the centered row
    let dashX = -1
    for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
      if (board.screen.cell(x, hrBox.y).char === "-") { dashX = x; break }
    }
    expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
    const cell = board.screen.cell(dashX, hrBox.y)
    expect(cell.attrs.dim, "unselected HR should be dim").toBe(true)
  }
})

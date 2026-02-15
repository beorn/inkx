/**
 * Smoke test for the visual test toolbelt.
 * Verifies that screen access and visual assertions work correctly.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("visual toolbelt: screen access", () => {
  test("screen.text returns rendered content", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2"))),
    )
    expect(board.screen.text).toContain("task1")
    expect(board.screen.text).toContain("task2")
  })

  test("screen.rows returns array of lines", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    expect(board.screen.rows.length).toBeGreaterThan(0)
    expect(board.screen.rows.some(r => r.includes("task1"))).toBe(true)
  })

  test("screen.row(n) returns specific row", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    const taskRow = board.screen.findRow("task1")
    expect(taskRow).toBeGreaterThan(-1)
    expect(board.screen.row(taskRow)).toContain("task1")
  })

  test("screen.cell returns char/fg/bg", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    // Cell at (0,0) should have some character
    const cell = board.screen.cell(0, 0)
    expect(cell).toHaveProperty("char")
    expect(cell).toHaveProperty("fg")
    expect(cell).toHaveProperty("bg")
    expect(cell).toHaveProperty("attrs")
  })

  test("screen.nodePos finds node position", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    const pos = board.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    expect(pos!.x).toBeGreaterThanOrEqual(0)
    expect(pos!.y).toBeGreaterThanOrEqual(0)
  })

  test("screen.nodeBox finds node bounding box", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})

describe("visual toolbelt: assertions", () => {
  test("expectScreen/expectScreenNot check content", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    board.expectScreen("task1")
    board.expectScreenNot("nonexistent")
  })

  test("expectRow checks row content", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    const taskRow = board.screen.findRow("task1")
    board.expectRow(taskRow, "task1")
  })

  test("expectRow with regex", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    const taskRow = board.screen.findRow("task1")
    board.expectRow(taskRow, /task\d+/)
  })

  test("expectCellChar checks character", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    const pos = board.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    // The cell at the node position should have a character
    const cell = board.screen.cell(pos!.x, pos!.y)
    board.expectCellChar(pos!.x, pos!.y, cell.char)
  })

  test("chaining works — all visual assertions return board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2"))),
    )
    // All assertions should be chainable
    board
      .expectScreen("task1")
      .expectScreen("task2")
      .expectScreenNot("nonexistent")
      .press("j")
      .expectScreen("task2")
  })
})

describe("visual toolbelt: node color", () => {
  test("selected card has non-null background", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2"))),
    )
    // task1 should be selected (first card) — check it has some bg color
    const pos = board.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    // Look for a content cell (skip border)
    let found = false
    for (let x = pos!.x; x < pos!.x + 20; x++) {
      const cell = board.screen.cell(x, pos!.y)
      if (cell.char.trim() !== "" && !"│┌┐└┘├┤─".includes(cell.char)) {
        // Selected card should have a background color (yellow = 3)
        expect(cell.bg).not.toBeNull()
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})

describe("visual toolbelt: border assertions", () => {
  test("screen.nodeBox returns position for border inspection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"))),
    )
    // nodeBox lets you manually check border characters
    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    // Can inspect individual cells
    const cell = board.screen.cell(box!.x, box!.y)
    expect(cell.char).toBeDefined()
  })
})

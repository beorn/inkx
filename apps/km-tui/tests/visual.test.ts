/**
 * Visual test toolbelt and navigation rendering tests.
 *
 * Consolidated from:
 * - visual-toolbelt.test.ts (screen access, assertions, color, borders)
 * - visual-navigation-rendering.test.tsx (card position registration, findItemAtY)
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { createGridNavigator } from "@km/board"
import { createFakeRepo } from "@km/storage"
import { testEnv, item, renderBoardWithStore } from "./helpers/board-test.ts"

// =============================================================================
// Visual toolbelt: screen access
// =============================================================================

describe("visual toolbelt: screen access", () => {
  test("screen.text returns rendered content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))
    expect(board.screen.text).toContain("task1")
    expect(board.screen.text).toContain("task2")
  })

  test("screen.rows returns array of lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    expect(board.screen.rows.length).toBeGreaterThan(0)
    expect(board.screen.rows.some((r) => r.includes("task1"))).toBe(true)
  })

  test("screen.row(n) returns specific row", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    const taskRow = board.screen.findRow("task1")
    expect(taskRow).toBeGreaterThan(-1)
    expect(board.screen.row(taskRow)).toContain("task1")
  })

  test("screen.cell returns char/fg/bg", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    // Cell at (0,0) should have some character
    const cell = board.screen.cell(0, 0)
    expect(cell).toHaveProperty("char")
    expect(cell).toHaveProperty("fg")
    expect(cell).toHaveProperty("bg")
    expect(cell).toHaveProperty("attrs")
  })

  test("screen.nodePos finds node position", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    const pos = board.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    expect(pos!.x).toBeGreaterThanOrEqual(0)
    expect(pos!.y).toBeGreaterThanOrEqual(0)
  })

  test("screen.nodeBox finds node bounding box", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})

// =============================================================================
// Visual toolbelt: assertions
// =============================================================================

describe("visual toolbelt: assertions", () => {
  test("expectScreen/expectScreenNot check content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    board.expectScreen("task1")
    board.expectScreenNot("nonexistent")
  })

  test("expectRow checks row content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    const taskRow = board.screen.findRow("task1")
    board.expectRow(taskRow, "task1")
  })

  test("expectRow with regex", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    const taskRow = board.screen.findRow("task1")
    board.expectRow(taskRow, /task\d+/)
  })

  test("expectCellChar checks character", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    const pos = board.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    // The cell at the node position should have a character
    const cell = board.screen.cell(pos!.x, pos!.y)
    board.expectCellChar(pos!.x, pos!.y, cell.char)
  })

  test("chaining works — all visual assertions return board", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))
    // All assertions should be chainable
    board.expectScreen("task1").expectScreen("task2").expectScreenNot("nonexistent").press("j").expectScreen("task2")
  })
})

// =============================================================================
// Visual toolbelt: node color
// =============================================================================

describe("visual toolbelt: node color", () => {
  test("selected card has non-null background", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"), item("task2"))))
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

// =============================================================================
// Visual toolbelt: border assertions
// =============================================================================

describe("visual toolbelt: border assertions", () => {
  test("screen.nodeBox returns position for border inspection", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1"))))
    // nodeBox lets you manually check border characters
    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    // Can inspect individual cells
    const cell = board.screen.cell(box!.x, box!.y)
    expect(cell.char).toBeDefined()
  })
})

// =============================================================================
// Visual navigation integration: card position registration
// =============================================================================

const render80 = createRenderer({ cols: 80, rows: 24 })

describe("Visual navigation integration: card position registration", () => {
  test("cards in single column register with increasing Y positions", () => {
    const registry = createGridNavigator()

    const nodes = item("board", item("col1", item("1a"), item("1b"), item("1c")))
    const repo = createFakeRepo({ nodes })

    const app = renderBoardWithStore(repo, "board", {
      navigator: registry,
      render: render80,
    })

    // Verify render contains the tasks
    expect(app.text).toContain("1a")
    expect(app.text).toContain("1b")
    expect(app.text).toContain("1c")

    // Verify cards registered their positions
    expect(registry.hasSection(0)).toBe(true)

    // Get positions and verify they have increasing Y values
    const l1 = registry.getPosition(0, 0)!
    const l2 = registry.getPosition(0, 1)!
    const l3 = registry.getPosition(0, 2)!

    expect(l1.y).toBeLessThan(l2.y)
    expect(l2.y).toBeLessThan(l3.y)
  })

  test("cards in same row across columns have same Y position", () => {
    const registry = createGridNavigator()

    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b")))
    const repo = createFakeRepo({ nodes })

    renderBoardWithStore(repo, "board", {
      navigator: registry,
      render: render80,
    })

    // Both columns should have cards registered
    expect(registry.hasSection(0)).toBe(true)
    expect(registry.hasSection(1)).toBe(true)

    // First cards in each column should have similar Y positions
    const lA1 = registry.getPosition(0, 0)!
    const lB1 = registry.getPosition(1, 0)!

    // Cards at same position in different columns should have same Y
    // (within a small tolerance for borders)
    expect(Math.abs(lA1.y - lB1.y)).toBeLessThanOrEqual(1)
  })

  test("findItemAtY returns correct card index", () => {
    const registry = createGridNavigator()

    const nodes = item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b")))
    const repo = createFakeRepo({ nodes })

    renderBoardWithStore(repo, "board", {
      navigator: registry,
      render: render80,
    })

    // Get the Y position of 1b (card at index 1 in col0)
    const lA2 = registry.getPosition(0, 1)!
    const targetY = lA2.y + lA2.height / 2

    // Find the card at that Y in column 1
    const foundIdx = registry.findItemAtY(1, targetY)

    // Should find 2b (index 1) since it's at similar Y to 1b
    expect(foundIdx).toBe(1)
  })
})

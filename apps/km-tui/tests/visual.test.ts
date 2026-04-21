/**
 * Visual test toolbelt, spatial helpers, and navigation rendering tests.
 *
 * Consolidated from:
 * - visual-toolbelt.test.ts (screen access, assertions, color, borders)
 * - visual-navigation-rendering.test.tsx (card position registration, findItemAtY)
 * - spatial-helpers.spec.ts (at(), columns(), cards() spatial queries)
 * - dim-subtree.test.ts (dim styling for done/dropped task children)
 */

import { describe, test, expect, beforeEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { createGridNavigator } from "@km/board"
import { createFakeRepo } from "@km/storage"
import { createTestBoard } from "@km/tui/test"
import { item, renderBoardWithStore } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Visual toolbelt: screen access
// =============================================================================

describe("visual toolbelt: screen access", () => {
  test("screen.text returns rendered content", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))
    expect(app.screen.text).toContain("task1")
    expect(app.screen.text).toContain("task2")
  })

  test("screen.rows returns array of lines", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    expect(app.screen.rows.length).toBeGreaterThan(0)
    expect(app.screen.rows.some((r) => r.includes("task1"))).toBe(true)
  })

  test("screen.row(n) returns specific row", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    const taskRow = app.screen.findRow("task1")
    expect(taskRow).toBeGreaterThan(-1)
    expect(app.screen.row(taskRow)).toContain("task1")
  })

  test("screen.cell returns char/fg/bg", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    // Cell at (0,0) should have some character
    const cell = app.screen.cell(0, 0)
    expect(cell).toHaveProperty("char")
    expect(cell).toHaveProperty("fg")
    expect(cell).toHaveProperty("bg")
  })

  test("screen.nodePos finds node position", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    const pos = app.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    expect(pos!.x).toBeGreaterThanOrEqual(0)
    expect(pos!.y).toBeGreaterThanOrEqual(0)
  })

  test("screen.nodeBox finds node bounding box", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    const box = app.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})

// =============================================================================
// Visual toolbelt: assertions
// =============================================================================

describe("visual toolbelt: assertions", () => {
  test("toContainText matcher checks screen content (canonical)", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    expect(app).toContainText("task1")
    expect(app).not.toContainText("nonexistent")
  })

  test("expectScreen/expectScreenNot check content (deprecated — prefer toContainText)", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    app.expectScreen("task1")
    app.expectScreenNot("nonexistent")
  })

  test("expectRow checks row content", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    const taskRow = app.screen.findRow("task1")
    app.expectRow(taskRow, "task1")
  })

  test("expectRow with regex", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    const taskRow = app.screen.findRow("task1")
    app.expectRow(taskRow, /task\d+/)
  })

  test("expectCellChar checks character", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    const pos = app.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    // The cell at the node position should have a character
    const cell = app.screen.cell(pos!.x, pos!.y)
    app.expectCellChar(pos!.x, pos!.y, cell.char)
  })

  test("chaining works — all visual assertions return app", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))
    // All assertions should be chainable
    app
      .expectScreen("task1")
      .expectScreen("task2")
      .expectScreenNot("nonexistent")
      .command("cursor_down")
      .expectScreen("task2")
  })
})

// =============================================================================
// Visual toolbelt: node color
// =============================================================================

describe("visual toolbelt: node color", () => {
  test("selected card has non-null background", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))
    // task1 should be selected (first card) — check it has some bg color
    const pos = app.screen.nodePos("task1")
    expect(pos).not.toBeNull()
    // Look for a content cell (skip border)
    let found = false
    for (let x = pos!.x; x < pos!.x + 20; x++) {
      const cell = app.screen.cell(x, pos!.y)
      if (cell.char.trim() !== "" && !"│┌┐└┘├┤─".includes(cell.char)) {
        // Selected card should have a background color
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
    using app = createTestApp(item("board", item("col1", item("task1"))))
    // nodeBox lets you manually check border characters
    const box = app.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    // Can inspect individual cells
    const cell = app.screen.cell(box!.x, box!.y)
    expect(cell.char).toBeDefined()
  })
})

// =============================================================================
// Visual navigation integration: card position registration
// =============================================================================

describe("Visual navigation integration: card position registration", () => {
  // Fresh renderer per test — sharing one across tests in this describe
  // causes test pollution: the layout subscribers from an earlier test's
  // tree survive into the next render and the new registry never gets
  // populated for some cards.
  let render80: ReturnType<typeof createRenderer>
  beforeEach(() => {
    render80 = createRenderer({ cols: 80, rows: 24 })
  })

  test("cards in single column register with increasing Y positions", () => {
    const registry = createGridNavigator()

    const nodes = item.simpleBoard()
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

// =============================================================================
// Spatial helpers: at(), columns(), cards()
// =============================================================================

describe("spatial helpers", () => {
  test("at() returns element info with bounding box", () => {
    const board = createTestBoard(["Col1 > Task A", "Col1 > Task B", "Col2 > Task C"])

    const colInfo = board.at("#Col1")
    expect(colInfo.exists).toBe(true)
    expect(colInfo.text).toContain("Task A")
    expect(colInfo.box).toBeDefined()
    if (colInfo.box) {
      expect(colInfo.box.width).toBeGreaterThan(0)
      expect(colInfo.box.height).toBeGreaterThan(0)
    }
  })

  test("columns() returns column info array", () => {
    const board = createTestBoard(["Col1 > A", "Col1 > B", "Col2 > C", "Col3 > D"])

    const cols = board.columns()
    expect(cols.length).toBeGreaterThanOrEqual(2) // At least 2 visible in 80 cols
    expect(cols[0]!.cardCount).toBe(2) // Col1 has 2 cards
    expect(cols[0]!.hasCursor).toBe(true) // Cursor starts in first column
  })

  test("cards() returns card info array", () => {
    const board = createTestBoard(["Col > Task A", "Col > Task B", "Col > Task C"])

    const cards = board.cards()
    expect(cards.length).toBe(3)
    expect(cards[0]!.text).toBe("Task A")
    expect(cards[0]!.column).toBe(0)
    expect(cards[0]!.hasCursor).toBe(true) // Cursor on first card
  })

  test("cursor moves update card.hasCursor", () => {
    const board = createTestBoard(["Col > A", "Col > B", "Col > C"])

    let cards = board.cards()
    expect(cards[0]!.hasCursor).toBe(true)
    expect(cards[1]!.hasCursor).toBe(false)

    board.press("j")

    cards = board.cards()
    expect(cards[0]!.hasCursor).toBe(false)
    expect(cards[1]!.hasCursor).toBe(true)
  })
})

// =============================================================================
// Dim subtree: children of done/dropped tasks are dimmed
// =============================================================================

describe("dim-subtree: children of done/dropped tasks are dimmed", () => {
  test("done task's sub-items are dimmed in outline view", () => {
    // Create a folder with children, then mark it as done task
    const nodes = item("board", item("col1", item("doneParent", item("child1"), item("child2"))))
    const parent = nodes.find((n) => n.id === "doneParent")!
    parent.item = { ...parent.item, task: { status: "done", marker: "[x]" } }
    parent.item = { ...parent.item, list: "-" }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Use Tab to expand the card outline so children are visible
    app.command("indent_node")

    expect(app).toContainText("child1")

    const childBox = app.screen.nodeBox("child1")
    expect(childBox, "child1 should have a nodeBox").not.toBeNull()
    if (!childBox) return

    const row = app.screen.row(childBox.y)
    const childIdx = row.indexOf("child1")
    expect(childIdx, "child1 text should be in the row").toBeGreaterThan(-1)

    const cell = app.screen.cell(childIdx, childBox.y)
    expect(cell.dim, "child of done task should be dimmed").toBe(true)
  })

  test("dropped task's sub-items are dimmed", () => {
    const nodes = item("board", item("col1", item("droppedParent", item("child1"))))
    const parent = nodes.find((n) => n.id === "droppedParent")!
    parent.item = { ...parent.item, task: { status: "dropped", marker: "[-]" } }
    parent.item = { ...parent.item, list: "-" }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.command("indent_node")

    const childBox = app.screen.nodeBox("child1")
    expect(childBox, "child1 should be visible").not.toBeNull()
    if (!childBox) return

    const row = app.screen.row(childBox.y)
    const childIdx = row.indexOf("child1")
    expect(childIdx).toBeGreaterThan(-1)

    const cell = app.screen.cell(childIdx, childBox.y)
    expect(cell.dim, "child of dropped task should be dimmed").toBe(true)
  })

  test("open task's sub-items are NOT dimmed when parent is selected", () => {
    const nodes = item("board", item("col1", item("openParent", item("child1"))))

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.command("indent_node")

    const childBox = app.screen.nodeBox("child1")
    expect(childBox, "child1 should be visible").not.toBeNull()
    if (!childBox) return

    const row = app.screen.row(childBox.y)
    const childIdx = row.indexOf("child1")
    expect(childIdx).toBeGreaterThan(-1)

    const cell = app.screen.cell(childIdx, childBox.y)
    expect(cell.dim, "child of open task should not be dimmed").toBeFalsy()
  })

  test("done task's title itself is dimmed (non-selected)", () => {
    const nodes = item("board", item("col1", item("doneParent", item("child1")), item.task("otherTask")))
    const parent = nodes.find((n) => n.id === "doneParent")!
    parent.item = { ...parent.item, task: { status: "done", marker: "[x]" } }
    parent.item = { ...parent.item, list: "-" }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Move cursor to otherTask so doneParent is not selected
    app.command("cursor_down")

    const nodeBox = app.screen.nodeBox("doneParent")
    expect(nodeBox, "doneParent should be visible").not.toBeNull()
    if (!nodeBox) return

    const row = app.screen.row(nodeBox.y)
    const titleIdx = row.indexOf("doneParent")
    expect(titleIdx).toBeGreaterThan(-1)

    const cell = app.screen.cell(titleIdx, nodeBox.y)
    expect(cell.dim, "done task title should be dimmed").toBe(true)
  })
})

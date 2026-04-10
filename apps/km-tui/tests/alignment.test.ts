/**
 * Alignment tests for TUI board rendering.
 *
 * Verifies that columns, cards, icons, borders, titles, and content are
 * properly aligned with no extra padding or misalignment.
 */

import { describe, test, expect, beforeAll } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp, type TestApp } from "./helpers/test-app.ts"

// Wider terminal for multi-column tests
const WIDE = { cols: 120, rows: 30 }
const WIDE_ENV = { columns: 120, rows: 30 }

// =============================================================================
// Helpers
// =============================================================================

/** Check if a character is a box-drawing border character. */
function isBorderChar(c: string): boolean {
  return "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)
}

/**
 * Scan a row of a bounding box for the first non-space, non-border content character.
 * Returns the X offset relative to box.x, or -1 if not found.
 */
function findContentXOffset(
  screen: TestApp["screen"],
  box: { x: number; y: number; width: number },
  row: number,
): number {
  for (let x = box.x; x < box.x + box.width; x++) {
    const cell = screen.cell(x, row)
    if (cell.char.trim() !== "" && !isBorderChar(cell.char)) {
      return x - box.x
    }
  }
  return -1
}

/**
 * Find the X position of the first occurrence of a bullet/icon character
 * (non-space, non-border, non-alphanumeric) in the first row of a node's box.
 * Returns absolute X position, or -1 if not found.
 */
function findBulletX(screen: TestApp["screen"], nodeId: string): number {
  const box = screen.nodeBox(nodeId)
  if (!box) return -1
  for (let x = box.x; x < box.x + box.width; x++) {
    const cell = screen.cell(x, box.y)
    if (cell.char.trim() !== "" && !isBorderChar(cell.char)) {
      return x
    }
  }
  return -1
}

/**
 * Find the X position where title text starts (after the 2-char prefix: marker + space).
 * Returns absolute X position, or -1 if not found.
 */
function findTitleStartX(screen: TestApp["screen"], nodeId: string): number {
  const bulletX = findBulletX(screen, nodeId)
  if (bulletX < 0) return -1
  // Title starts 2 chars after bullet (marker + space)
  return bulletX + 2
}

// =============================================================================
// Shared fixture: single column 80x24 (col1 with 1a)
// =============================================================================

describe("alignment: single column 80x24", () => {
  let app: TestApp
  beforeAll(() => {
    app = createTestApp(item("board", item("col1", item("1a"))), { cols: 80, rows: 24 })
  })

  test("column separator line spans the column width", () => {
    const colBox = app.screen.nodeBox("col1")
    expect(colBox).not.toBeNull()
    // Separator is the second row of the column (row after header)
    const sepY = colBox!.y + 1
    const sepRow = app.screen.row(sepY)
    const dashCount = [...sepRow].filter((c) => c === "\u2500").length
    // The separator should span most of the column width (minus 1 for column padding)
    expect(dashCount).toBeGreaterThanOrEqual(colBox!.width - 2)
  })

  test("bullet offset from card border is consistent (2-char prefix)", () => {
    const box = app.screen.nodeBox("1a")
    expect(box).not.toBeNull()
    const bulletX = findBulletX(app.screen, "1a")
    expect(bulletX).toBeGreaterThan(0)
    // The bullet should be at a small, fixed offset from the TreeNode content area start
    const offset = bulletX - box!.x
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThanOrEqual(2)
  })

  test("no blank row between separator and first card", () => {
    const colBox = app.screen.nodeBox("col1")
    const cardBox = app.screen.nodeBox("1a")
    expect(colBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    // Column structure: header (row 0), separator (row 1), first card starts (row 2+)
    // The card's TreeNode content box should be within 4 rows of column top
    // (header + separator + card top border + content)
    const gap = cardBox!.y - colBox!.y
    // Header (1) + separator (1) + card top border (1) = 3 rows minimum
    // Allow max 4 rows (header + separator + 1 padding + card border)
    expect(gap).toBeLessThanOrEqual(4)
    expect(gap).toBeGreaterThanOrEqual(2) // At minimum: header + separator
  })

  test("card content starts immediately after prefix (no extra indent)", () => {
    const box = app.screen.nodeBox("1a")
    expect(box).not.toBeNull()
    // Find the bullet and verify title follows immediately (2-char prefix)
    const bulletX = findBulletX(app.screen, "1a")
    expect(bulletX).toBeGreaterThan(-1)

    // The character 2 positions after the bullet should be the start of the title
    // (bullet char + space = 2 chars)
    const titleChar = app.screen.cell(bulletX + 2, box!.y)
    // It should be a non-space character (the first letter of the title)
    expect(titleChar.char.trim()).not.toBe("")
  })

  test("single-column board fills available width", () => {
    const colBox = app.screen.nodeBox("col1")
    expect(colBox).not.toBeNull()
    // Single column should use nearly all the terminal width
    expect(colBox!.width).toBeGreaterThanOrEqual(78)
  })
})

// =============================================================================
// Shared fixture: 3 cards in 1 column 80x24
// =============================================================================

describe("alignment: 3 cards in single column 80x24", () => {
  let app: TestApp
  beforeAll(() => {
    app = createTestApp(item.simpleBoard, { cols: 80, rows: 24 })
  })

  test("all card left borders align in the same column", () => {
    const boxes = ["1a", "1b", "1c"].map((id) => app.screen.nodeBox(id))
    for (const box of boxes) expect(box).not.toBeNull()
    // All left edges should be at the same X
    expect(boxes[0]!.x).toBe(boxes[1]!.x)
    expect(boxes[1]!.x).toBe(boxes[2]!.x)
  })

  test("unselected body cards have consistent widths", () => {
    // 1a is selected (yellow border), 1b and 1c are unselected (dim gray border)
    const boxes = ["1b", "1c"].map((id) => app.screen.nodeBox(id))
    for (const box of boxes) expect(box).not.toBeNull()
    // Unselected body cards should have matching widths
    expect(boxes[0]!.width).toBe(boxes[1]!.width)
    // Right edges should align
    const rightEdge0 = boxes[0]!.x + boxes[0]!.width
    const rightEdge1 = boxes[1]!.x + boxes[1]!.width
    expect(rightEdge0).toBe(rightEdge1)
  })

  test("all card bullets within a column are at the same X position", () => {
    const x1 = findBulletX(app.screen, "1a")
    const x2 = findBulletX(app.screen, "1b")
    const x3 = findBulletX(app.screen, "1c")
    expect(x1).toBeGreaterThan(0)
    expect(x2).toBeGreaterThan(0)
    expect(x3).toBeGreaterThan(0)
    expect(x1).toBe(x2)
    expect(x2).toBe(x3)
  })

  test("all card titles start at the same X offset (after 2-char prefix)", () => {
    const t1 = findTitleStartX(app.screen, "1a")
    const t2 = findTitleStartX(app.screen, "1b")
    const t3 = findTitleStartX(app.screen, "1c")
    expect(t1).toBeGreaterThan(0)
    expect(t2).toBeGreaterThan(0)
    expect(t3).toBeGreaterThan(0)
    expect(t1).toBe(t2)
    expect(t2).toBe(t3)
  })
})

// =============================================================================
// Shared fixture: 3 cards in 1 column 80x30 (card stacking)
// =============================================================================

describe("alignment: card vertical stacking", () => {
  test("card vertical stacking has no overlap", () => {
    using app = createTestApp(item.simpleBoard, { cols: 80, rows: 30 })
    const boxA = app.screen.nodeBox("1a")
    const boxB = app.screen.nodeBox("1b")
    const boxC = app.screen.nodeBox("1c")
    expect(boxA).not.toBeNull()
    expect(boxB).not.toBeNull()
    expect(boxC).not.toBeNull()
    // Each card should start at or after the previous card ends
    // (accounting for card border height)
    expect(boxB!.y).toBeGreaterThanOrEqual(boxA!.y + boxA!.height)
    expect(boxC!.y).toBeGreaterThanOrEqual(boxB!.y + boxB!.height)
  })
})

// =============================================================================
// Shared fixture: 2 cards 80x24 (selected vs unselected border)
// =============================================================================

describe("alignment: selected vs unselected border", () => {
  test("selected body card has border, unselected has dim border", () => {
    using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))), { cols: 80, rows: 24 })
    // 1a is selected — should have border
    app.expectNodeBorder("1a")
    // 1b is unselected — should also have border (dim gray)
    app.expectNodeBorder("1b")
  })
})

// =============================================================================
// Shared fixture: 2 columns WIDE (col1/1a, col2/2a)
// =============================================================================

describe("alignment: 2 columns WIDE", () => {
  let app: TestApp
  beforeAll(() => {
    app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), WIDE)
  })

  test("multiple columns are horizontally adjacent with no gaps", () => {
    const box1 = app.screen.nodeBox("col1")
    const box2 = app.screen.nodeBox("col2")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    // col2 should start right after col1 (at most 1 char separator gap)
    const gap = box2!.x - (box1!.x + box1!.width)
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("title start X is consistent across columns", () => {
    const box1 = app.screen.nodeBox("1a")
    const box2 = app.screen.nodeBox("2a")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    const t1 = findTitleStartX(app.screen, "1a")
    const t2 = findTitleStartX(app.screen, "2a")
    // Offset relative to card left edge should be same
    expect(t1 - box1!.x).toBe(t2 - box2!.x)
  })

  test("columns are horizontally adjacent (no blank column gap)", () => {
    const box1 = app.screen.nodeBox("col1")
    const box2 = app.screen.nodeBox("col2")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    // Gap between columns (may include 1-char separator)
    const gap = box2!.x - (box1!.x + box1!.width)
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("no trailing blank columns after the last column", () => {
    const box2 = app.screen.nodeBox("col2")
    expect(box2).not.toBeNull()
    // The last column should extend close to the terminal right edge
    const rightEdge = box2!.x + box2!.width
    // Allow some slack for scroll indicator (1 char) and rounding
    expect(rightEdge).toBeGreaterThanOrEqual(WIDE.cols - 2)
  })

  test("columns have equal height (full board height minus bars)", () => {
    const box1 = app.screen.nodeBox("col1")
    const box2 = app.screen.nodeBox("col2")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    expect(box1!.height).toBe(box2!.height)
  })
})

// =============================================================================
// Shared fixture: 3 columns WIDE (col1/1a, col2/2a, col3/3a)
// =============================================================================

describe("alignment: 3 columns WIDE", () => {
  let app: TestApp
  beforeAll(() => {
    app = createTestApp(item.multiColBoard, WIDE)
  })

  test("all column headers start at the same Y position", () => {
    const box1 = app.screen.nodeBox("col1")
    const box2 = app.screen.nodeBox("col2")
    const box3 = app.screen.nodeBox("col3")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    expect(box3).not.toBeNull()
    expect(box1!.y).toBe(box2!.y)
    expect(box2!.y).toBe(box3!.y)
  })

  test("three columns span the full terminal width", () => {
    const box1 = app.screen.nodeBox("col1")
    const box3 = app.screen.nodeBox("col3")
    expect(box1).not.toBeNull()
    expect(box3).not.toBeNull()
    // First column should start near X=0 (allowing for overflow indicators: 1 char each side)
    expect(box1!.x).toBeLessThanOrEqual(2)
    // Last column should extend to near the terminal width (minus overflow indicators)
    const rightEdge = box3!.x + box3!.width
    expect(rightEdge).toBeGreaterThanOrEqual(WIDE.cols - 4)
  })
})

// =============================================================================
// Shared fixture: 2 columns WIDE with 2 cards each
// =============================================================================

describe("alignment: 2 columns WIDE with multiple cards", () => {
  let app: TestApp
  beforeAll(() => {
    app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))), WIDE)
  })

  test("cards across different columns have consistent unselected card widths", () => {
    // 1a is selected (yellow border), 1b/2a/2b are unselected (dim gray border)
    const box1b = app.screen.nodeBox("1b")
    const box2b = app.screen.nodeBox("2b")
    expect(box1b).not.toBeNull()
    expect(box2b).not.toBeNull()
    // Cross-column unselected cards should have similar widths (columns may differ slightly)
    expect(Math.abs(box1b!.width - box2b!.width)).toBeLessThanOrEqual(1)
  })

  test("bullets align across columns", () => {
    // Bullets within col1
    const x1a = findBulletX(app.screen, "1a")
    const x1b = findBulletX(app.screen, "1b")
    expect(x1a).toBe(x1b)
    // Bullets within col2
    const x2a = findBulletX(app.screen, "2a")
    const x2b = findBulletX(app.screen, "2b")
    expect(x2a).toBe(x2b)
    // Bullet offset relative to card start should be same across columns
    const box1a = app.screen.nodeBox("1a")
    const box2a = app.screen.nodeBox("2a")
    expect(box1a).not.toBeNull()
    expect(box2a).not.toBeNull()
    const offset1 = x1a - box1a!.x
    const offset2 = x2a - box2a!.x
    expect(offset1).toBe(offset2)
  })
})

// =============================================================================
// Title alignment: unique fixtures
// =============================================================================

describe("alignment: title text", () => {
  test("titles are left-aligned (not centered or right-aligned)", () => {
    using app = createTestApp(item("board", item("col1", item("Short"), item("A longer title here"))), {
      cols: 80,
      rows: 24,
    })
    const tShort = findTitleStartX(app.screen, "Short")
    const tLong = findTitleStartX(app.screen, "A longer title here")
    expect(tShort).toBeGreaterThan(0)
    expect(tLong).toBeGreaterThan(0)
    // Both titles should start at the same X (left-aligned, not centered)
    expect(tShort).toBe(tLong)
  })
})

// =============================================================================
// 5. Date badge alignment (unique fixtures — node mutation before createTestApp)
// =============================================================================

describe("alignment: date badges", () => {
  // Use dates far in the future so they always render as "Mon DD" (not relative like "Sunday")
  test("date badge is right-aligned within card width", () => {
    const nodes = item("board", item("col1", item.task("Task with date")))
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_at = "2027-03-15"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    expect(app.text).toContain("Mar 15")

    // Find the row containing "Mar 15" and verify it's right-aligned
    const badgeRow = app.screen.findRow("Mar 15")
    expect(badgeRow).toBeGreaterThan(-1)
    const rowText = app.screen.row(badgeRow)
    const badgeIndex = rowText.indexOf("Mar 15")
    const titleIndex = rowText.indexOf("Task with date")
    // Badge should appear to the right of the title
    if (titleIndex >= 0) {
      expect(badgeIndex).toBeGreaterThan(titleIndex)
    }
  })

  test("date badges in different cards are at consistent right offsets", () => {
    const nodes = item("board", item("col1", item.task("Task A"), item.task("Task B")))
    const taskA = nodes.find((n) => n.content === "Task A")!
    const taskB = nodes.find((n) => n.content === "Task B")!
    taskA.due_at = "2027-03-15"
    taskB.due_at = "2027-04-20"

    using app = createTestApp(nodes, { cols: 80, rows: 24 })
    expect(app.text).toContain("Mar 15")
    expect(app.text).toContain("Apr 20")

    // Find both badge rows
    const rowA = app.screen.findRow("Mar 15")
    const rowB = app.screen.findRow("Apr 20")
    expect(rowA).toBeGreaterThan(-1)
    expect(rowB).toBeGreaterThan(-1)

    // Both badges should end at approximately the same X position (right-aligned)
    const textA = app.screen.row(rowA)
    const textB = app.screen.row(rowB)
    const endA = textA.indexOf("Mar 15") + "Mar 15".length
    const endB = textB.indexOf("Apr 20") + "Apr 20".length
    // Allow 2 char tolerance for different badge content lengths
    expect(Math.abs(endA - endB)).toBeLessThanOrEqual(2)
  })
})

// =============================================================================
// 7. Collapsed column alignment
// =============================================================================

describe("alignment: collapsed columns", () => {
  // Shared fixture: left-collapsed col1 + col2, WIDE (collapsed via keypress)
  describe("left-collapsed column with normal column", () => {
    let app: TestApp
    beforeAll(() => {
      app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), WIDE)
      // Collapse col1 via keypress (cursor starts on 1a in col1)
      app.command("toggle_collapse")
    })

    test("collapsed column has border characters on both sides", () => {
      // Find the collapsed column
      const collapsed = app.q("[data-collapsed]")
      expect(collapsed.count()).toBeGreaterThan(0)
      const box = collapsed.boundingBox()
      expect(box).not.toBeNull()

      // Check that border chars exist on both sides for at least some rows
      let leftBorderCount = 0
      let rightBorderCount = 0
      for (let y = box!.y; y < box!.y + box!.height; y++) {
        const leftCell = app.screen.cell(box!.x, y)
        const rightCell = app.screen.cell(box!.x + box!.width - 1, y)
        if (isBorderChar(leftCell.char)) leftBorderCount++
        if (isBorderChar(rightCell.char)) rightBorderCount++
      }
      // Most rows should have border chars on both sides
      expect(leftBorderCount).toBeGreaterThan(0)
      expect(rightBorderCount).toBeGreaterThan(0)
    })

    test("collapsed column is adjacent to normal column (no gap)", () => {
      const collapsed = app.q("[data-collapsed]")
      expect(collapsed.count()).toBeGreaterThan(0)
      const collapsedBox = collapsed.boundingBox()
      const col2Box = app.screen.nodeBox("col2")
      expect(collapsedBox).not.toBeNull()
      expect(col2Box).not.toBeNull()

      // Gap between collapsed column and normal column
      const gap = col2Box!.x - (collapsedBox!.x + collapsedBox!.width)
      // At most 1 char separator between them
      expect(gap).toBeLessThanOrEqual(1)
    })

    test("collapsed column is narrow (<=5 chars)", () => {
      const collapsed = app.q("[data-collapsed]")
      expect(collapsed.count()).toBeGreaterThan(0)
      const box = collapsed.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeLessThanOrEqual(5)
    })
  })

  test("collapsed column on the right is also adjacent", () => {
    using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), WIDE)
    // Navigate to col2 and collapse it
    app.command("cursor_right").command("toggle_collapse")

    const col1Box = app.screen.nodeBox("col1")
    const collapsed = app.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)
    const collapsedBox = collapsed.boundingBox()
    expect(col1Box).not.toBeNull()
    expect(collapsedBox).not.toBeNull()

    const gap = collapsedBox!.x - (col1Box!.x + col1Box!.width)
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("multiple collapsed columns via keypress", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a")),
        item("col2", item("2a")),
        item("col3", item("3a")),
        item("col4", item("4a")),
      ),
      // Use extra-wide terminal to ensure all 4 columns fit
      { cols: 160, rows: 30 },
    )
    // Collapse col2: navigate right to col2, then collapse
    app.command("cursor_right").command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(1)

    // Move to col3 and collapse it
    app.command("cursor_right").command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(2)

    // Verify col1 is visible
    const col1Box = app.screen.nodeBox("col1")
    expect(col1Box).not.toBeNull()
    expect(col1Box!.x).toBeLessThanOrEqual(2)

    // Verify all 4 data-column elements exist (2 collapsed + 2 expanded)
    const allColumns = app.q("[data-column]")
    expect(allColumns.count()).toBe(4)

    // Verify the rightmost column extends to near terminal width
    let maxRight = 0
    for (let i = 0; i < 4; i++) {
      const colLoc = app.q(`[data-col-index="${i}"]`)
      if (colLoc.count() > 0) {
        const box = colLoc.boundingBox()
        if (box) {
          const right = box.x + box.width
          if (right > maxRight) maxRight = right
        }
      }
    }
    expect(maxRight).toBeGreaterThanOrEqual(158)
  })
})

// =============================================================================
// 8. Cross-cutting alignment
// =============================================================================

describe("alignment: cross-cutting", () => {
  test("all rendered lines fit within terminal width", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
      WIDE,
    )
    const rows = app.screen.rows
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(WIDE.cols)
    }
  })
})

// =============================================================================
// Visual invariant assertions
// =============================================================================

describe("visual invariant assertions", () => {
  // FREEZE: needs expectColumnsAligned (testEnv-only)
  test.skip("expectColumnsAligned verifies column order and non-overlap", () => {
    const { board } = testEnv(item.multiColBoard, WIDE_ENV)
    board.expectColumnsAligned(["col1", "col2", "col3"])
  })

  // FREEZE: needs expectNoBlankLine (testEnv-only)
  test.skip("expectNoBlankLine detects no blank rows in content area", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))), {
      columns: 80,
      rows: 24,
    })
    // Skip row 0 (breadcrumb) and row 1 (spacer); check rows 2-9 (column content)
    board.expectNoBlankLine(2, 10)
  })

  // FREEZE: needs expectCursorVisible (testEnv-only)
  test.skip("expectCursorVisible confirms cursor is on screen", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    board.expectCursorVisible()
    board.command("cursor_down").expectCursorVisible()
  })

  test("expectNoGhostChars passes on clean render", () => {
    using app = createTestApp(item("board", item("col1", item("1a"))))
    app.expectNoGhostChars()
  })

  // FREEZE: needs expectTextNotOverflowing (testEnv-only)
  test.skip("expectTextNotOverflowing passes for normal cards", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.expectTextNotOverflowing("1a")
  })

  // FREEZE: needs expectBorderContinuous (testEnv-only)
  test.skip("expectBorderContinuous verifies card border integrity", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.expectBorderContinuous("1a")
  })

  // FREEZE: needs expectAdjacentBorders (testEnv-only)
  test.skip("expectAdjacentBorders verifies neighboring borders after navigation", () => {
    const { board } = testEnv(item.simpleBoard)
    board.command("cursor_down").expectAdjacentBorders("1b")
  })
})

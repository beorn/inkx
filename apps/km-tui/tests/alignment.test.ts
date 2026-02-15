/**
 * Alignment tests for TUI board rendering.
 *
 * Verifies that columns, cards, icons, borders, titles, and content are
 * properly aligned with no extra padding or misalignment.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// Wider terminal for multi-column tests
const WIDE = { columns: 120, rows: 30 }

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
  board: ReturnType<typeof testEnv>["board"],
  box: { x: number; y: number; width: number },
  row: number,
): number {
  for (let x = box.x; x < box.x + box.width; x++) {
    const cell = board.screen.cell(x, row)
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
function findBulletX(
  board: ReturnType<typeof testEnv>["board"],
  nodeId: string,
): number {
  const box = board.screen.nodeBox(nodeId)
  if (!box) return -1
  for (let x = box.x; x < box.x + box.width; x++) {
    const cell = board.screen.cell(x, box.y)
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
function findTitleStartX(
  board: ReturnType<typeof testEnv>["board"],
  nodeId: string,
): number {
  const bulletX = findBulletX(board, nodeId)
  if (bulletX < 0) return -1
  // Title starts 2 chars after bullet (marker + space)
  return bulletX + 2
}

// =============================================================================
// 1. Column alignment
// =============================================================================

describe("alignment: column headers", () => {
  test("all column headers start at the same Y position", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      WIDE,
    )
    const box1 = board.screen.nodeBox("col1")
    const box2 = board.screen.nodeBox("col2")
    const box3 = board.screen.nodeBox("col3")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    expect(box3).not.toBeNull()
    expect(box1!.y).toBe(box2!.y)
    expect(box2!.y).toBe(box3!.y)
  })

  test("column separator line spans the column width", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 80, rows: 24 },
    )
    const colBox = board.screen.nodeBox("col1")
    expect(colBox).not.toBeNull()
    // Separator is the second row of the column (row after header)
    const sepY = colBox!.y + 1
    const sepRow = board.screen.row(sepY)
    const dashCount = [...sepRow].filter((c) => c === "\u2500").length
    // The separator should span most of the column width (minus 1 for column padding)
    expect(dashCount).toBeGreaterThanOrEqual(colBox!.width - 2)
  })

  test("multiple columns are horizontally adjacent with no gaps", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const box1 = board.screen.nodeBox("col1")
    const box2 = board.screen.nodeBox("col2")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    // col2 should start right after col1 (at most 1 char separator gap)
    const gap = box2!.x - (box1!.x + box1!.width)
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("three columns span the full terminal width", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      WIDE,
    )
    const box1 = board.screen.nodeBox("col1")
    const box3 = board.screen.nodeBox("col3")
    expect(box1).not.toBeNull()
    expect(box3).not.toBeNull()
    // First column should start near X=0 (allowing for scroll indicators)
    expect(box1!.x).toBeLessThanOrEqual(1)
    // Last column should extend to near the terminal width
    const rightEdge = box3!.x + box3!.width
    expect(rightEdge).toBeGreaterThanOrEqual(WIDE.columns - 2)
  })
})

// =============================================================================
// 2. Card border alignment
// =============================================================================

describe("alignment: card borders", () => {
  test("all card left borders align in the same column", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 24 },
    )
    // Cards are inside the column; their nodeBox is the TreeNode content area.
    // The Card component wraps each TreeNode in a Box with borderStyle="round".
    // We find the card border by looking left of the TreeNode's nodeBox.
    const boxes = ["1a", "1b", "1c"].map((id) => board.screen.nodeBox(id))
    for (const box of boxes) expect(box).not.toBeNull()
    // All left edges should be at the same X
    expect(boxes[0]!.x).toBe(boxes[1]!.x)
    expect(boxes[1]!.x).toBe(boxes[2]!.x)
  })

  test("all card right borders align (same width)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 24 },
    )
    const boxes = ["1a", "1b", "1c"].map((id) => board.screen.nodeBox(id))
    for (const box of boxes) expect(box).not.toBeNull()
    // All widths should be equal (cards fill the column width)
    expect(boxes[0]!.width).toBe(boxes[1]!.width)
    expect(boxes[1]!.width).toBe(boxes[2]!.width)
    // Right edges should all be at the same X
    const rightEdge0 = boxes[0]!.x + boxes[0]!.width
    const rightEdge1 = boxes[1]!.x + boxes[1]!.width
    const rightEdge2 = boxes[2]!.x + boxes[2]!.width
    expect(rightEdge0).toBe(rightEdge1)
    expect(rightEdge1).toBe(rightEdge2)
  })

  test("card border characters are present (round style)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 80, rows: 24 },
    )
    // nodeBox("1a") returns the TreeNode content area (inside the border).
    // The Card wraps it in a Box with borderStyle="round", so border chars
    // are 1 cell outside the nodeBox on each side.
    const box = board.screen.nodeBox("1a")
    expect(box).not.toBeNull()
    // Check for border chars to the left (1 col before nodeBox x)
    const borderX = box!.x - 1
    if (borderX >= 0) {
      const leftBorderCell = board.screen.cell(borderX, box!.y)
      expect(
        isBorderChar(leftBorderCell.char),
        `Expected border char at (${borderX},${box!.y}), got "${leftBorderCell.char}"`,
      ).toBe(true)
    }
    // Check for border chars to the right (1 col after nodeBox right edge)
    const rightBorderX = box!.x + box!.width
    if (rightBorderX < 80) {
      const rightBorderCell = board.screen.cell(rightBorderX, box!.y)
      expect(
        isBorderChar(rightBorderCell.char),
        `Expected border char at (${rightBorderX},${box!.y}), got "${rightBorderCell.char}"`,
      ).toBe(true)
    }
  })

  test("cards across different columns have consistent card widths relative to column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
        ),
      WIDE,
    )
    const box1a = board.screen.nodeBox("1a")
    const box1b = board.screen.nodeBox("1b")
    const box2a = board.screen.nodeBox("2a")
    const box2b = board.screen.nodeBox("2b")
    expect(box1a).not.toBeNull()
    expect(box1b).not.toBeNull()
    expect(box2a).not.toBeNull()
    expect(box2b).not.toBeNull()
    // Cards within col1 have same width
    expect(box1a!.width).toBe(box1b!.width)
    // Cards within col2 have same width
    expect(box2a!.width).toBe(box2b!.width)
    // Column widths are equal (same number of cards), so card widths should match
    // Allow 1 char difference due to remainder distribution
    expect(Math.abs(box1a!.width - box2a!.width)).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// 3. Icon/bullet alignment
// =============================================================================

describe("alignment: icon/bullet", () => {
  test("all card bullets within a column are at the same X position", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 24 },
    )
    const x1 = findBulletX(board, "1a")
    const x2 = findBulletX(board, "1b")
    const x3 = findBulletX(board, "1c")
    expect(x1).toBeGreaterThan(0)
    expect(x2).toBeGreaterThan(0)
    expect(x3).toBeGreaterThan(0)
    expect(x1).toBe(x2)
    expect(x2).toBe(x3)
  })

  test("bullet offset from card border is consistent (2-char prefix)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 80, rows: 24 },
    )
    const box = board.screen.nodeBox("1a")
    expect(box).not.toBeNull()
    const bulletX = findBulletX(board, "1a")
    expect(bulletX).toBeGreaterThan(0)
    // The bullet should be at a small, fixed offset from the TreeNode content area start
    const offset = bulletX - box!.x
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThanOrEqual(2)
  })

  test("bullets align across columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
        ),
      WIDE,
    )
    // Bullets within col1
    const x1a = findBulletX(board, "1a")
    const x1b = findBulletX(board, "1b")
    expect(x1a).toBe(x1b)
    // Bullets within col2
    const x2a = findBulletX(board, "2a")
    const x2b = findBulletX(board, "2b")
    expect(x2a).toBe(x2b)
    // Bullet offset relative to card start should be same across columns
    const box1a = board.screen.nodeBox("1a")
    const box2a = board.screen.nodeBox("2a")
    expect(box1a).not.toBeNull()
    expect(box2a).not.toBeNull()
    const offset1 = x1a - box1a!.x
    const offset2 = x2a - box2a!.x
    expect(offset1).toBe(offset2)
  })
})

// =============================================================================
// 4. Title alignment
// =============================================================================

describe("alignment: title text", () => {
  test("all card titles start at the same X offset (after 2-char prefix)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 24 },
    )
    const t1 = findTitleStartX(board, "1a")
    const t2 = findTitleStartX(board, "1b")
    const t3 = findTitleStartX(board, "1c")
    expect(t1).toBeGreaterThan(0)
    expect(t2).toBeGreaterThan(0)
    expect(t3).toBeGreaterThan(0)
    expect(t1).toBe(t2)
    expect(t2).toBe(t3)
  })

  test("title start X is consistent across columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const box1 = board.screen.nodeBox("1a")
    const box2 = board.screen.nodeBox("2a")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    const t1 = findTitleStartX(board, "1a")
    const t2 = findTitleStartX(board, "2a")
    // Offset relative to card left edge should be same
    expect(t1 - box1!.x).toBe(t2 - box2!.x)
  })

  test("titles are left-aligned (not centered or right-aligned)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Short"), item("A longer title here"))),
      { columns: 80, rows: 24 },
    )
    const tShort = findTitleStartX(board, "Short")
    const tLong = findTitleStartX(board, "A longer title here")
    expect(tShort).toBeGreaterThan(0)
    expect(tLong).toBeGreaterThan(0)
    // Both titles should start at the same X (left-aligned, not centered)
    expect(tShort).toBe(tLong)
  })
})

// =============================================================================
// 5. Date badge alignment
// =============================================================================

describe("alignment: date badges", () => {
  test("date badge is right-aligned within card width", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Task with date")),
    )
    // Set a due date on the task
    const taskNode = nodes.find((n) => n.content === "Task with date")!
    taskNode.due_date = "2026-03-15"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screenshot = board.screenshot()
    // Date badge should appear somewhere in the output
    expect(screenshot).toContain("Mar 15")

    // Find the row containing "Mar 15" and verify it's right-aligned
    const badgeRow = board.screen.findRow("Mar 15")
    expect(badgeRow).toBeGreaterThan(-1)
    const rowText = board.screen.row(badgeRow)
    const badgeIndex = rowText.indexOf("Mar 15")
    const titleIndex = rowText.indexOf("Task with date")
    // Badge should appear to the right of the title
    if (titleIndex >= 0) {
      expect(badgeIndex).toBeGreaterThan(titleIndex)
    }
  })

  test("date badges in different cards are at consistent right offsets", () => {
    const nodes = item(
      "board",
      item("col1", item.task("Task A"), item.task("Task B")),
    )
    const taskA = nodes.find((n) => n.content === "Task A")!
    const taskB = nodes.find((n) => n.content === "Task B")!
    taskA.due_date = "2026-03-15"
    taskB.due_date = "2026-04-20"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })
    const screenshot = board.screenshot()
    expect(screenshot).toContain("Mar 15")
    expect(screenshot).toContain("Apr 20")

    // Find both badge rows
    const rowA = board.screen.findRow("Mar 15")
    const rowB = board.screen.findRow("Apr 20")
    expect(rowA).toBeGreaterThan(-1)
    expect(rowB).toBeGreaterThan(-1)

    // Both badges should end at approximately the same X position (right-aligned)
    const textA = board.screen.row(rowA)
    const textB = board.screen.row(rowB)
    const endA = textA.indexOf("Mar 15") + "Mar 15".length
    const endB = textB.indexOf("Apr 20") + "Apr 20".length
    // Allow 2 char tolerance for different badge content lengths
    expect(Math.abs(endA - endB)).toBeLessThanOrEqual(2)
  })
})

// =============================================================================
// 6. No extra padding
// =============================================================================

describe("alignment: no extra padding", () => {
  test("no blank row between separator and first card", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 80, rows: 24 },
    )
    const colBox = board.screen.nodeBox("col1")
    const cardBox = board.screen.nodeBox("1a")
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

  test("columns are horizontally adjacent (no blank column gap)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const box1 = board.screen.nodeBox("col1")
    const box2 = board.screen.nodeBox("col2")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    // Gap between columns (may include 1-char separator)
    const gap = box2!.x - (box1!.x + box1!.width)
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("card content starts immediately after prefix (no extra indent)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 80, rows: 24 },
    )
    const box = board.screen.nodeBox("1a")
    expect(box).not.toBeNull()
    // Find the bullet and verify title follows immediately (2-char prefix)
    const bulletX = findBulletX(board, "1a")
    expect(bulletX).toBeGreaterThan(-1)

    // The character 2 positions after the bullet should be the start of the title
    // (bullet char + space = 2 chars)
    const titleChar = board.screen.cell(bulletX + 2, box!.y)
    // It should be a non-space character (the first letter of the title)
    expect(titleChar.char.trim()).not.toBe("")
  })

  test("no trailing blank columns after the last column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const box2 = board.screen.nodeBox("col2")
    expect(box2).not.toBeNull()
    // The last column should extend close to the terminal right edge
    const rightEdge = box2!.x + box2!.width
    // Allow some slack for scroll indicator (1 char) and rounding
    expect(rightEdge).toBeGreaterThanOrEqual(WIDE.columns - 2)
  })
})

// =============================================================================
// 7. Collapsed column alignment
// =============================================================================

describe("alignment: collapsed columns", () => {
  test("collapsed column has border characters on both sides", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1 collapse=true", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    // Find the collapsed column
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)
    const box = collapsed.boundingBox()
    expect(box).not.toBeNull()

    // Check that border chars exist on both sides for at least some rows
    let leftBorderCount = 0
    let rightBorderCount = 0
    for (let y = box!.y; y < box!.y + box!.height; y++) {
      const leftCell = board.screen.cell(box!.x, y)
      const rightCell = board.screen.cell(box!.x + box!.width - 1, y)
      if (isBorderChar(leftCell.char)) leftBorderCount++
      if (isBorderChar(rightCell.char)) rightBorderCount++
    }
    // Most rows should have border chars on both sides
    expect(leftBorderCount).toBeGreaterThan(0)
    expect(rightBorderCount).toBeGreaterThan(0)
  })

  test("collapsed column is adjacent to normal column (no gap)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1 collapse=true", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)
    const collapsedBox = collapsed.boundingBox()
    const col2Box = board.screen.nodeBox("col2")
    expect(collapsedBox).not.toBeNull()
    expect(col2Box).not.toBeNull()

    // Gap between collapsed column and normal column
    const gap = col2Box!.x - (collapsedBox!.x + collapsedBox!.width)
    // At most 1 char separator between them
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("collapsed column is narrow (<=5 chars)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1 collapse=true", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)
    const box = collapsed.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(5)
  })

  test("collapsed column on the right is also adjacent", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2 collapse=true", item("2a")),
        ),
      WIDE,
    )
    const col1Box = board.screen.nodeBox("col1")
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)
    const collapsedBox = collapsed.boundingBox()
    expect(col1Box).not.toBeNull()
    expect(collapsedBox).not.toBeNull()

    const gap = collapsedBox!.x - (col1Box!.x + col1Box!.width)
    expect(gap).toBeLessThanOrEqual(1)
  })

  test("multiple collapsed columns between normal columns", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2 collapse=true", item("2a")),
          item("col3 collapse=true", item("3a")),
          item("col4", item("4a")),
        ),
      // Use extra-wide terminal to ensure all 4 columns fit
      { columns: 160, rows: 30 },
    )
    // Both collapsed columns should be narrow
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(2)

    // Verify col1 is visible
    const col1Box = board.screen.nodeBox("col1")
    expect(col1Box).not.toBeNull()
    expect(col1Box!.x).toBeLessThanOrEqual(1)

    // Verify all 4 data-column elements exist
    const allColumns = board.q("[data-column]")
    expect(allColumns.count()).toBe(4)

    // Verify the rightmost column extends to near terminal width
    // Find the last column by checking all column bounding boxes
    let maxRight = 0
    for (let i = 0; i < 4; i++) {
      const colLoc = board.q(`[data-col-index="${i}"]`)
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
  test("card vertical stacking has no overlap", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"), item("1b"), item("1c"))),
      { columns: 80, rows: 30 },
    )
    const boxA = board.screen.nodeBox("1a")
    const boxB = board.screen.nodeBox("1b")
    const boxC = board.screen.nodeBox("1c")
    expect(boxA).not.toBeNull()
    expect(boxB).not.toBeNull()
    expect(boxC).not.toBeNull()
    // Each card should start at or after the previous card ends
    // (accounting for card border height)
    expect(boxB!.y).toBeGreaterThanOrEqual(boxA!.y + boxA!.height)
    expect(boxC!.y).toBeGreaterThanOrEqual(boxB!.y + boxB!.height)
  })

  test("all rendered lines fit within terminal width", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
          item("col3", item("3a"), item("3b"), item("3c")),
        ),
      WIDE,
    )
    const rows = board.screen.rows
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(WIDE.columns)
    }
  })

  test("columns have equal height (full board height minus bars)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
        ),
      WIDE,
    )
    const box1 = board.screen.nodeBox("col1")
    const box2 = board.screen.nodeBox("col2")
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    expect(box1!.height).toBe(box2!.height)
  })

  test("single-column board fills available width", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { columns: 80, rows: 24 },
    )
    const colBox = board.screen.nodeBox("col1")
    expect(colBox).not.toBeNull()
    // Single column should use nearly all the terminal width
    expect(colBox!.width).toBeGreaterThanOrEqual(78)
  })
})

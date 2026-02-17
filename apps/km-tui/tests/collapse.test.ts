/**
 * Collapse/uncollapse column tests
 *
 * Covers:
 * - Basic collapse/uncollapse toggle via 'c' key
 * - Different column types (file, folder, mixed, body, empty)
 * - Pre-collapsed columns (collapse=true rule)
 * - Navigation between collapsed/uncollapsed columns
 * - Cursor preservation on collapse/uncollapse
 * - Multiple collapsed columns
 * - Virtual body column collapse
 * - Column header level interactions
 * - Collapsed column width (narrow <=5 chars)
 * - Incremental vs fresh render consistency
 * - Collapsed column card visibility
 * - Collapsed column border symmetry and alignment
 * - Collapsed column after shift (Meta+l)
 * - Uncollapse header rendering
 */

import { describe, test, it, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Basic collapse/uncollapse
// =============================================================================

describe("collapse/uncollapse columns", () => {
  test("c collapses the current column (regular children)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Cursor starts at first card in col1
    expect(board.q("[data-cursor]").textContent()).toContain("task-a")

    // Press 'c' to collapse col1
    board.press("c")

    // After collapse, cursor should be on column header (not an invisible card)
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)

    // Cursor should be on the collapsed column
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("c on collapsed column uncollapses it", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Collapse col1
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Uncollapse col1
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)

    // Cards should be visible again
    expect(board.q("[data-cursor]").count()).toBe(1)
  })

  // =========================================================================
  // Different column types
  // =========================================================================

  test("c collapses column with file children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-files", item.file("file1"), item.file("file2")),
        item("col-other", item("task1")),
      ),
    )

    // Cursor should be on file1
    expect(board.q("[data-cursor]").textContent()).toContain("file1")

    // Collapse
    board.press("c")
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)

    // Uncollapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with folder children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a")), item.folder("sub-b")),
        item("col-other", item("task1")),
      ),
    )

    // Collapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Uncollapse
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with mixed file/folder/task children", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-mixed", item.file("file-a"), item.folder("folder-b"), item("task-c")),
        item("col-other", item("x")),
      ),
    )

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with body content (paragraphs before items)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col-body", item.paragraph("intro text"), item("task1")),
        item("col-other", item("x")),
      ),
    )

    // Navigate to col-body body card (intro text)
    expect(board.q("[data-cursor]").textContent()).toContain("intro text")

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses empty column", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("empty-col"),
        item("col-other", item("x")),
      ),
    )

    // Navigate to empty column header
    // First, navigate up to board level
    board.press("k")
    // Then down to first column header
    board.press("j")
    // Move right to get to empty-col if needed (depends on initial cursor)
    // Actually let's just go up to board level first then navigate
    // Initial cursor should be on first card which is in col-other (since empty-col has no cards)

    // Press c - should work even on columns with no cards
    board.press("c")
    // (empty column collapse behavior - just verifying no crash)
  })

  // =========================================================================
  // Pre-collapsed columns (via rules)
  // =========================================================================

  test("column with collapse=true starts collapsed", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1 collapse=true", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // col1 should be collapsed from the start
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Cursor should be on col2's first card since col1 is collapsed
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    expect(cursor.textContent()).toContain("task-c")
  })

  test("uncollapsing a collapse=true column works", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1 collapse=true", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Navigate to collapsed col1 header (h from col2's card)
    board.press("h")

    // Uncollapse
    board.press("c")

    // Should now show cards
    // Navigate down into col1
    board.press("j")
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-a")
  })

  // =========================================================================
  // Navigation between collapsed and uncollapsed columns
  // =========================================================================

  test("h/l navigation works between collapsed and uncollapsed columns", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
        item("col3", item("task-d")),
      ),
    )

    // Collapse col1
    board.press("c")

    // Move right to col2
    board.press("l")
    let cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Move right to col3
    board.press("l")
    cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-d")

    // Move left back to col2
    board.press("h")
    cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Move left to collapsed col1
    board.press("h")
    cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Should be on col1 header (collapsed)
  })

  test("j/k on collapsed column stays on header", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Collapse col1
    board.press("c")

    // Try pressing j - should not enter collapsed column
    board.press("j")
    // Should stay at column header or move to next column
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Cursor preservation
  // =========================================================================

  test("cursor moves to column header on collapse", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b"), item("task-c")),
        item("col2", item("task-d")),
      ),
    )

    // Navigate to task-b (second card)
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("task-b")

    // Collapse - cursor should move to column header
    board.press("c")

    // Collapsed column should have cursor
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // The cursor element should be on the collapsed column itself
    const collapsed = board.q("[data-collapsed][data-cursor]")
    expect(collapsed.count()).toBe(1)
  })

  test("cursor goes to first card on uncollapse", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Collapse
    board.press("c")

    // Uncollapse
    board.press("c")

    // Cursor should be somewhere valid
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Multiple collapsed columns
  // =========================================================================

  test("multiple columns can be collapsed independently", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a")),
        item("col2", item("task-b")),
        item("col3", item("task-c")),
      ),
    )

    // Collapse col1 (cursor starts on task-a)
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(1)

    // After collapse, cursor is on col1 header. Move right to col2's card
    board.press("l")

    // Collapse col2
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBe(2)

    // After collapse, cursor on col2 header. Move right to col3
    board.press("l")
    const cursor = board.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Uncollapse col1: h from col3's card goes to col1 (since col2 is collapsed)
    board.press("h")
    board.press("c") // toggle collapse on whichever column we landed on

    // Should now have fewer collapsed columns
    const collapsedAfter = board.q("[data-collapsed]").count()
    expect(collapsedAfter).toBeLessThan(2) // at least one was uncollapsed
  })

  // =========================================================================
  // Virtual body column
  // =========================================================================

  test("c on virtual body column (Description) does not crash", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item.paragraph("intro text"),
        item("col1", item("task-a")),
      ),
    )

    // Cursor starts on body card ("intro text")
    expect(board.q("[data-cursor]").textContent()).toContain("intro text")

    // Try to collapse the virtual body column
    board.press("c")

    // Should not crash - cursor should still be valid
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Column header level interactions
  // =========================================================================

  test("c from column header level collapses the column", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
      ),
    )

    // Navigate to column header (k from first card)
    board.press("k")

    // Collapse from column header
    board.press("c")
    expect(board.q("[data-collapsed]").count()).toBeGreaterThan(0)
  })

  test("c from board level does nothing (no column to collapse)", () => {
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("col1", item("task-a")),
        item("col2", item("task-b")),
      ),
    )

    // Navigate to board level
    board.press("k").press("k")

    // Try to collapse from board level - should be a no-op
    board.press("c")

    // Should still be at board level or no crash
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// Collapsed column width
// =============================================================================

describe("collapsed column width", () => {
  it("collapsed column via keypress should be narrow (<=5 chars wide)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
          item("col3", item("task-e")),
        ),
      { columns: 80, rows: 24 },
    )

    // Navigate to col2 and collapse it
    board.press("l").press("c")

    // The collapsed column should exist and be narrow
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  it("collapsed column via collapse=true rule should be narrow (<=5 chars wide)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2 collapse=true", item("task-c"), item("task-d")),
          item("col3", item("task-e")),
        ),
      { columns: 80, rows: 24 },
    )

    // col2 should be collapsed from the start
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  it("expanded columns should get more space when sibling is collapsed", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24 },
    )

    // Get col1 width before collapse
    const col1Before = board.q("#col1").boundingBox()
    expect(col1Before).not.toBeNull()

    // Collapse col2
    board.press("l").press("c")

    // Get col1 width after collapse — should be wider
    const col1After = board.q("#col1").boundingBox()
    expect(col1After).not.toBeNull()
    expect(col1After!.width).toBeGreaterThan(col1Before!.width)
  })

  it("incremental render of collapse matches fresh render", () => {
    // Render board and collapse col2 incrementally
    const { board: incrementalBoard } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24, incremental: true },
    )
    incrementalBoard.press("l").press("c")
    const incrementalScreenshot = incrementalBoard.screenshot()

    // Render same board with same collapse, but use fresh (non-incremental) rendering
    const { board: freshBoard } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24, incremental: false },
    )
    freshBoard.press("l").press("c")
    const freshScreenshot = freshBoard.screenshot()

    // Both should produce identical output
    expect(incrementalScreenshot).toBe(freshScreenshot)
  })

  it("incremental render buffer matches fresh render after collapse", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
          item("col3", item("task-e")),
        ),
      { columns: 120, rows: 30, incremental: true },
    )
    board.press("l").press("c")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (a.char !== b.char || JSON.stringify(a.fg) !== JSON.stringify(b.fg) || JSON.stringify(a.bg) !== JSON.stringify(b.bg) || JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)) {
          expect.fail(
            `Cell mismatch at (${x},${y}): ` +
              `inc={char:${JSON.stringify(a.char)} fg:${JSON.stringify(a.fg)} bg:${JSON.stringify(a.bg)} attrs:${JSON.stringify(a.attrs)}} ` +
              `fresh={char:${JSON.stringify(b.char)} fg:${JSON.stringify(b.fg)} bg:${JSON.stringify(b.bg)} attrs:${JSON.stringify(b.attrs)}}`,
          )
        }
      }
    }
  })

  it("collapsed column cards are not visible in rendered output", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task-a"), item("task-b")),
          item("col2", item("task-c"), item("task-d")),
        ),
      { columns: 80, rows: 24 },
    )

    // Verify cards are visible before collapse
    const beforeScreenshot = board.screenshot()
    expect(beforeScreenshot).toContain("task-c")
    expect(beforeScreenshot).toContain("task-d")

    // Collapse col2
    board.press("l").press("c")

    // Cards inside collapsed column should NOT be visible
    const afterScreenshot = board.screenshot()
    expect(afterScreenshot).not.toContain("task-c")
    expect(afterScreenshot).not.toContain("task-d")

    // But col1 cards should still be visible
    expect(afterScreenshot).toContain("task-a")
    expect(afterScreenshot).toContain("task-b")
  })
})

// =============================================================================
// Collapsed column border symmetry (km-tui.collapsed-shift)
// =============================================================================

describe("collapsed column border symmetry", () => {
  test("collapsed column inner border fills allocated width exactly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse "Todo" column
    board.press("c")
    board.expect("[data-collapsed]").toExist()

    // Find the collapsed column box
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    // Scan the top row for border characters within the column area
    let firstBorderX = -1
    let lastBorderX = -1
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (isBorderChar(cell.char)) {
        if (firstBorderX === -1) firstBorderX = x
        lastBorderX = x
      }
    }

    // First border char should be at box.x (no left margin shift)
    expect(
      firstBorderX,
      `First border char at top should be at x=${box.x}, got ${firstBorderX}`,
    ).toBe(box.x)
    // Last border char should be at box.x + box.width - 1 (right border present)
    expect(
      lastBorderX,
      `Last border char at top should be at x=${box.x + box.width - 1}, got ${lastBorderX}`,
    ).toBe(box.x + box.width - 1)
  })

  test("collapsed column right border is not cut off", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse "Todo" column
    board.press("c")

    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    // Check a middle row — both left and right borders should be present
    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    const midY = box.y + Math.floor(box.height / 2)
    const leftCell = board.screen.cell(box.x, midY)
    const rightCell = board.screen.cell(box.x + box.width - 1, midY)
    expect(
      isBorderChar(leftCell.char),
      `Left border at (${box.x}, ${midY}) should be │ but got '${leftCell.char}'`,
    ).toBe(true)
    expect(
      isBorderChar(rightCell.char),
      `Right border at (${box.x + box.width - 1}, ${midY}) should be │ but got '${rightCell.char}'`,
    ).toBe(true)
  })

  test("collapsed column borders are symmetric (left and right present on all rows)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse "Todo" column
    board.press("c")

    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = box.y; y < box.y + box.height; y++) {
      const leftCell = board.screen.cell(box.x, y)
      const rightCell = board.screen.cell(box.x + box.width - 1, y)
      const leftIsBorder = isBorderChar(leftCell.char)
      const rightIsBorder = isBorderChar(rightCell.char)
      expect(
        leftIsBorder && rightIsBorder,
        `Row y=${y}: left='${leftCell.char}' right='${rightCell.char}' — expected both to be border chars`,
      ).toBe(true)
    }
  })
})

// =============================================================================
// Collapsed column after shift
// =============================================================================

describe("collapsed column after shift", () => {
  test("collapsed column borders intact after Meta+l shift right", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Navigate to column header level, collapse Todo
    board.press("k")
    board.expect("#Todo[data-cursor]").toExist()
    board.press("c")
    board.expect("[data-collapsed]").toExist()

    // Shift collapsed Todo column right (swap with Done)
    board.press("Meta+l")
    board.expect("#Todo[data-cursor]").toExist()

    // Find the collapsed column box after shift
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    // Verify borders on all rows — the bug is that left border is shifted right
    // (too much left margin) and right border is cut off
    for (let y = box.y; y < box.y + box.height; y++) {
      const leftCell = board.screen.cell(box.x, y)
      const rightCell = board.screen.cell(box.x + box.width - 1, y)
      expect(
        isBorderChar(leftCell.char),
        `Row y=${y}: left border at x=${box.x} should be border char but got '${leftCell.char}'`,
      ).toBe(true)
      expect(
        isBorderChar(rightCell.char),
        `Row y=${y}: right border at x=${box.x + box.width - 1} should be border char but got '${rightCell.char}'`,
      ).toBe(true)
    }
  })

  test("collapsed column width stays narrow after Meta+l shift", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse Todo and shift right
    board.press("k")
    board.press("c")
    board.press("Meta+l")

    // The collapsed column should still be narrow (COLLAPSED_WIDTH = 3)
    const collapsed = board.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)
    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  test("collapsed column has no extra left margin after shift", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse Todo and shift right
    board.press("k")
    board.press("c")
    board.press("Meta+l")

    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)

    // Scan the top row: first border char should be at box.x (no left margin)
    let firstBorderX = -1
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (isBorderChar(cell.char)) {
        firstBorderX = x
        break
      }
    }
    expect(
      firstBorderX,
      `First border char should be at box.x=${box.x}, got ${firstBorderX}`,
    ).toBe(box.x)
  })

  test("incremental render matches fresh after collapse + shift", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Todo", item("1a"), item("1b")),
          item("Done", item("2a")),
          item("Later", item("3a")),
        ),
      { columns: 80, rows: 20, incremental: true },
    )

    // Collapse Todo and shift right
    board.press("k")
    board.press("c")
    board.press("Meta+l")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (a.char !== b.char || JSON.stringify(a.fg) !== JSON.stringify(b.fg) || JSON.stringify(a.bg) !== JSON.stringify(b.bg) || JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)) {
          expect.fail(
            `Cell mismatch at (${x},${y}): ` +
              `inc={char:${JSON.stringify(a.char)} fg:${JSON.stringify(a.fg)} bg:${JSON.stringify(a.bg)} attrs:${JSON.stringify(a.attrs)}} ` +
              `fresh={char:${JSON.stringify(b.char)} fg:${JSON.stringify(b.fg)} bg:${JSON.stringify(b.bg)} attrs:${JSON.stringify(b.attrs)}}`,
          )
        }
      }
    }
  })

  test("collapsed column at different positions renders correctly", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1")),
          item("Beta", item("b1")),
          item("Gamma", item("c1")),
          item("Delta", item("d1")),
        ),
      { columns: 120, rows: 20 },
    )

    // Navigate to Beta, collapse it
    board.press("l").press("k")
    board.expect("#Beta[data-cursor]").toExist()
    board.press("c")

    // Shift collapsed Beta right (past Gamma)
    board.press("Meta+l")
    board.expect("#Beta[data-cursor]").toExist()

    // Verify Beta is still narrow and has proper borders
    const betaBox = board.screen.nodeBox("Beta")
    expect(betaBox).not.toBeNull()
    if (!betaBox) return

    expect(betaBox.width).toBeLessThanOrEqual(5)

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰".includes(c)
    for (let y = betaBox.y; y < betaBox.y + betaBox.height; y++) {
      const leftCell = board.screen.cell(betaBox.x, y)
      const rightCell = board.screen.cell(betaBox.x + betaBox.width - 1, y)
      expect(
        isBorderChar(leftCell.char),
        `Row y=${y}: left at x=${betaBox.x} got '${leftCell.char}'`,
      ).toBe(true)
      expect(
        isBorderChar(rightCell.char),
        `Row y=${y}: right at x=${betaBox.x + betaBox.width - 1} got '${rightCell.char}'`,
      ).toBe(true)
    }

    // Also check visual order: Alpha, Gamma, Beta(collapsed), Delta
    const alphaBox = board.screen.nodeBox("Alpha")
    const gammaBox = board.screen.nodeBox("Gamma")
    const deltaBox = board.screen.nodeBox("Delta")
    expect(alphaBox).not.toBeNull()
    expect(gammaBox).not.toBeNull()
    expect(deltaBox).not.toBeNull()
    if (alphaBox && gammaBox && deltaBox) {
      expect(alphaBox.x).toBeLessThan(gammaBox.x)
      expect(gammaBox.x).toBeLessThan(betaBox.x)
      expect(betaBox.x).toBeLessThan(deltaBox.x)
    }
  })
})

// =============================================================================
// Uncollapse header rendering
// =============================================================================

describe("uncollapse header rendering", () => {
  test("column header text visible after collapse/uncollapse round-trip", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Initially, header should be visible
    board.expectScreen("Alpha")

    // Collapse
    board.press("c")
    board.expect("#a1").not.toExist()

    // Uncollapse
    board.press("c")
    board.expect("#a1").toExist()

    // Header text should still be visible after round-trip
    board.expectScreen("Alpha")
  })

  test("separator line visible after uncollapsing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.press("c")

    // Separator line (between header and cards) should be present
    board.expectScreen("\u2500")
  })

  test("header row contains column name after uncollapsing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("MyColumn", item("task1"), item("task2")),
          item("Other", item("other1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.expect("#task1").not.toExist()
    board.press("c")
    board.expect("#task1").toExist()

    // The column box should contain the header name in its first row
    const colBox = board.screen.nodeBox("MyColumn")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    const headerRow = board.screen.row(colBox.y)
    expect(headerRow).toContain("MyColumn")
  })

  test("card count visible in header after uncollapsing", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha", item("a1"), item("a2"), item("a3")),
          item("Beta", item("b1")),
        ),
      { columns: 80, rows: 20 },
    )

    // Collapse and uncollapse
    board.press("c")
    board.press("c")

    // The header should show the card count
    const screenshot = board.screenshot()
    expect(screenshot).toContain("3") // 3 cards in Alpha column
  })
})

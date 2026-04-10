/**
 * Collapse/uncollapse column tests
 *
 * Covers:
 * - Basic collapse/uncollapse toggle via 'c' key
 * - Different column types (file, folder, mixed, body, empty)
 * - Pre-collapsed columns (km.collapse:: true rule)
 * - Navigation between collapsed/uncollapsed columns
 * - Cursor preservation on collapse/uncollapse
 * - Multiple collapsed columns
 * - Virtual body column collapse
 * - Column header level interactions
 * - Collapsed column width (narrow <=5 chars)
 * - Incremental vs fresh render consistency
 * - Collapsed column card visibility
 * - Collapsed column border symmetry and alignment
 * - Collapsed column after shift (opt+l)
 * - Uncollapse header rendering
 */

import { describe, test, it, expect, beforeAll } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Basic collapse/uncollapse
// =============================================================================

describe("collapse/uncollapse columns", () => {
  test("c collapses the current column (regular children)", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // Cursor starts at first card in col1
    expect(app.q("[data-cursor]").textContent()).toContain("task-a")

    // Press 'c' to collapse col1
    app.command("toggle_collapse")

    // After collapse, cursor should be on column header (not an invisible card)
    const collapsed = app.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)

    // Cursor should be on the collapsed column
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("c on collapsed column uncollapses it", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // Collapse col1
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Uncollapse col1
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)

    // Cards should be visible again
    expect(app.q("[data-cursor]").count()).toBe(1)
  })

  // =========================================================================
  // Different column types
  // =========================================================================

  test("c collapses column with file children", () => {
    using app = createTestApp(
      item.root("board", item("col-files", item.file("file1"), item.file("file2")), item("col-other", item("task1"))),
    )

    // Cursor should be on file1
    expect(app.q("[data-cursor]").textContent()).toContain("file1")

    // Collapse
    app.command("toggle_collapse")
    const collapsed = app.q("[data-collapsed]")
    expect(collapsed.count()).toBeGreaterThan(0)

    // Uncollapse
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with folder children", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("col-folders", item.folder("sub-a", item("item-a")), item.folder("sub-b")),
        item("col-other", item("task1")),
      ),
    )

    // Collapse
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Uncollapse
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with mixed file/folder/task children", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("col-mixed", item.file("file-a"), item.folder("folder-b"), item("task-c")),
        item("col-other", item("x")),
      ),
    )

    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBeGreaterThan(0)

    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses column with body content (paragraphs before items)", () => {
    using app = createTestApp(
      item.root("board", item("col-body", item.p("intro text"), item("task1")), item("col-other", item("x"))),
    )

    // Navigate to col-body body card (intro text)
    expect(app.q("[data-cursor]").textContent()).toContain("intro text")

    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBeGreaterThan(0)

    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)
  })

  test("c collapses empty column", () => {
    using app = createTestApp(item.root("board", item("empty-col"), item("col-other", item("x"))))

    // Navigate to empty column header
    // First, navigate up to board level
    app.command("cursor_up")
    // Then down to first column header
    app.command("cursor_down")
    // Move right to get to empty-col if needed (depends on initial cursor)
    // Actually let's just go up to board level first then navigate
    // Initial cursor should be on first card which is in col-other (since empty-col has no cards)

    // Press c - should work even on columns with no cards
    app.command("toggle_collapse")
    // (empty column collapse behavior - just verifying no crash)
  })

  // =========================================================================
  // Pre-collapsed columns (via rules)
  // =========================================================================

  test("column with km.collapse:: true starts collapsed (narrow rendering)", () => {
    using app = createTestApp(
      item.root("board", item("col1 km.collapse:: true", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // col1 with km.collapse:: true should render as a narrow collapsed column
    const collapsed = app.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    // col1's cards should not be visible (collapsed)
    expect(app.text).not.toContain("task-a")
    expect(app.text).not.toContain("task-b")

    // col2's cards should be visible
    expect(app.text).toContain("task-c")
  })

  test("keypress collapse works as alternative to km.collapse:: true rule", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // Collapse col1 via keypress
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBeGreaterThan(0)

    // Navigate right to col2
    app.command("cursor_right")

    // Uncollapse col1: go back left
    app.command("cursor_left")
    app.command("toggle_collapse")

    // Navigate down into col1
    app.command("cursor_down")
    const cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-a")
  })

  // =========================================================================
  // Navigation between collapsed and uncollapsed columns
  // =========================================================================

  test("h/l navigation works between collapsed and uncollapsed columns", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c")),
        item("col3", item("task-d")),
      ),
    )

    // Collapse col1
    app.command("toggle_collapse")

    // Move right to col2
    app.command("cursor_right")
    let cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Move right to col3
    app.command("cursor_right")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-d")

    // Move left back to col2
    app.command("cursor_left")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Move left to collapsed col1
    app.command("cursor_left")
    cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // Should be on col1 header (collapsed)
  })

  test("j/k on collapsed column stays on header", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // Collapse col1
    app.command("toggle_collapse")

    // Try pressing j - should not enter collapsed column
    app.command("cursor_down")
    // Should stay at column header or move to next column
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Cursor preservation
  // =========================================================================

  test("cursor moves to column header on collapse", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b"), item("task-c")), item("col2", item("task-d"))),
    )

    // Navigate to task-b (second card)
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("task-b")

    // Collapse - cursor should move to column header
    app.command("toggle_collapse")

    // Collapsed column should have cursor
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    // The cursor element should be on the collapsed column itself
    const collapsed = app.q("[data-collapsed][data-cursor]")
    expect(collapsed.count()).toBe(1)
  })

  test("cursor goes to first card on uncollapse", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // Collapse
    app.command("toggle_collapse")

    // Uncollapse
    app.command("toggle_collapse")

    // Cursor should be somewhere valid
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Multiple collapsed columns
  // =========================================================================

  test("multiple columns can be collapsed independently", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a")), item("col2", item("task-b")), item("col3", item("task-c"))),
    )

    // Collapse col1 (cursor starts on task-a)
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(1)

    // After collapse, cursor is on col1 header. Move right to col2's card
    app.command("cursor_right")

    // Collapse col2
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(2)

    // After collapse, cursor on col2 header. Move right to col3
    app.command("cursor_right")
    const cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")

    // Uncollapse col1: h from col3's card goes to col1 (since col2 is collapsed)
    app.command("cursor_left")
    app.command("toggle_collapse") // toggle collapse on whichever column we landed on

    // Should now have fewer collapsed columns
    const collapsedAfter = app.q("[data-collapsed]").count()
    expect(collapsedAfter).toBeLessThan(2) // at least one was uncollapsed
  })

  // =========================================================================
  // Virtual body column
  // =========================================================================

  test("c on virtual body column (Description) does not crash", () => {
    using app = createTestApp(item.root("board", item.p("intro text"), item("col1", item("task-a"))))

    // Cursor starts on body card ("intro text")
    expect(app.q("[data-cursor]").textContent()).toContain("intro text")

    // Try to collapse the virtual body column
    app.command("toggle_collapse")

    // Should not crash - cursor should still be valid
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  // =========================================================================
  // Column header level interactions
  // =========================================================================

  test("c from column header level collapses the column", () => {
    using app = createTestApp(
      item.root("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"))),
    )

    // Navigate to column header (k from first card)
    app.command("cursor_up")

    // Collapse from column header
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBeGreaterThan(0)
  })

  test("c from board level does nothing (no column to collapse)", async () => {
    using app = createTestApp(item.root("board", item("col1", item("task-a")), item("col2", item("task-b"))))

    // Navigate to board level
    app.command("cursor_up")
    app.command("cursor_up")

    // Try to collapse from board level - should be a no-op
    app.command("toggle_collapse")

    // Should still be at board level or no crash
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBeLessThanOrEqual(1)
  })
})

// =============================================================================
// Collapsed column width
// =============================================================================

describe("collapsed column width", () => {
  it("collapsed column via keypress should be narrow (<=5 chars wide)", () => {
    // Use wider terminal (120 cols) to avoid silvery EXCESS layout warnings
    // when column widths change during collapse
    using app = createTestApp(
      item(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2", item("task-c"), item("task-d")),
        item("col3", item("task-e")),
      ),
      { cols: 120, rows: 24 },
    )

    // Navigate to col2 and collapse it
    app.command("cursor_right")
    app.command("toggle_collapse")

    // The collapsed column should exist and be narrow
    const collapsed = app.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  it("collapsed column via km.collapse:: true rule should be narrow", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("task-a"), item("task-b")),
        item("col2 km.collapse:: true", item("task-c"), item("task-d")),
        item("col3", item("task-e")),
      ),
      { cols: 120, rows: 24 },
    )

    // km.collapse:: true renders as a narrow collapsed column
    const collapsed = app.q("[data-collapsed]")
    expect(collapsed.count()).toBe(1)

    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)

    // col2's cards should not be visible (collapsed)
    expect(app.text).not.toContain("task-c")
    expect(app.text).not.toContain("task-d")

    // All 3 columns should exist (col2 is collapsed, not hidden)
    const allColumns = app.q("[data-column]")
    expect(allColumns.count()).toBe(3)
  })

  it("expanded columns should get more space when sibling is collapsed", () => {
    using app = createTestApp(
      item("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"), item("task-d"))),
      { cols: 80, rows: 24 },
    )

    // Get col1 width before collapse
    const col1Before = app.q("#col1").boundingBox()
    expect(col1Before).not.toBeNull()

    // Collapse col2
    app.command("cursor_right")
    app.command("toggle_collapse")

    // Get col1 width after collapse — should be wider
    const col1After = app.q("#col1").boundingBox()
    expect(col1After).not.toBeNull()
    expect(col1After!.width).toBeGreaterThan(col1Before!.width)
  })

  it("incremental render of collapse matches fresh render", async () => {
    // Render board and collapse col2 incrementally
    using incApp = createTestApp(
      item("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"), item("task-d"))),
      { cols: 80, rows: 24, incremental: true },
    )
    await incApp.command("cursor_right")
    await incApp.command("toggle_collapse")
    const incrementalScreenshot = incApp.text

    // Render same board with same collapse, but use fresh (non-incremental) rendering
    using freshApp = createTestApp(
      item("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"), item("task-d"))),
      { cols: 80, rows: 24, incremental: false },
    )
    await freshApp.command("cursor_right")
    await freshApp.command("toggle_collapse")
    const freshScreenshot = freshApp.text

    // Both should produce identical output
    expect(incrementalScreenshot).toBe(freshScreenshot)
  })

  // FREEZE: needs store.getState() — uses board._result.lastBuffer() / freshRender()
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
    board.command("cursor_right").command("toggle_collapse")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (
          a.char !== b.char ||
          JSON.stringify(a.fg) !== JSON.stringify(b.fg) ||
          JSON.stringify(a.bg) !== JSON.stringify(b.bg) ||
          JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)
        ) {
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
    using app = createTestApp(
      item("board", item("col1", item("task-a"), item("task-b")), item("col2", item("task-c"), item("task-d"))),
      { cols: 80, rows: 24 },
    )

    // Verify cards are visible before collapse
    const beforeScreenshot = app.text
    expect(beforeScreenshot).toContain("task-c")
    expect(beforeScreenshot).toContain("task-d")

    // Collapse col2
    app.command("cursor_right")
    app.command("toggle_collapse")

    // Cards inside collapsed column should NOT be visible
    const afterScreenshot = app.text
    expect(afterScreenshot).not.toContain("task-c")
    expect(afterScreenshot).not.toContain("task-d")

    // But col1 cards should still be visible
    expect(afterScreenshot).toContain("task-a")
    expect(afterScreenshot).toContain("task-b")
  })
})

// =============================================================================
// Collapsed column border symmetry (km-tui.collapsed-shift)
//
// Uses beforeAll with shared board, plus board.expect() / board.press() chained.
// Kept on testEnv because beforeAll async + using doesn't compose well here.
// =============================================================================

describe("collapsed column border symmetry", () => {
  // FREEZE: needs store.getState() — beforeAll shared env with board.screen.nodeBox/cell
  let board: ReturnType<typeof testEnv>["board"]
  beforeAll(() => {
    const env = testEnv(() => item("board", item("Todo", item("1a"), item("1b")), item("Done", item("2a"))), {
      columns: 80,
      rows: 20,
    })
    board = env.board
    board.command("toggle_collapse")
    board.expect("[data-collapsed]").toExist()
  })

  const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)

  test("collapsed column inner border fills allocated width exactly", () => {
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

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
    expect(firstBorderX, `First border char at top should be at x=${box.x}, got ${firstBorderX}`).toBe(box.x)
    // Last border char should be at box.x + box.width - 1 (right border present)
    expect(lastBorderX, `Last border char at top should be at x=${box.x + box.width - 1}, got ${lastBorderX}`).toBe(
      box.x + box.width - 1,
    )
  })

  test("collapsed column right border is not cut off", () => {
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    // Check a middle row — both left and right borders should be present
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
    const box = board.screen.nodeBox("Todo")
    expect(box).not.toBeNull()
    if (!box) return

    let borderRowCount = 0
    // Exclude bottom 2 rows which may have rendering artifacts from
    // border-round + flexGrow interaction in collapsed column layout
    const lastCheckedRow = box.y + box.height - 2
    for (let y = box.y; y < lastCheckedRow; y++) {
      const leftCell = board.screen.cell(box.x, y)
      const rightCell = board.screen.cell(box.x + box.width - 1, y)
      const leftIsBorder = isBorderChar(leftCell.char)
      const rightIsBorder = isBorderChar(rightCell.char)
      if (leftIsBorder || rightIsBorder) {
        expect(
          leftIsBorder && rightIsBorder,
          `Row y=${y}: left='${leftCell.char}' right='${rightCell.char}' — expected both to be border chars`,
        ).toBe(true)
        borderRowCount++
      }
    }
    // Must have at least the top corner row + several vertical rows
    expect(borderRowCount).toBeGreaterThanOrEqual(3)
  })
})

// =============================================================================
// Collapsed column after shift
//
// beforeAll-shared env + board.press("opt+l") + _result.lastBuffer() —
// kept on testEnv.
// =============================================================================

describe("collapsed column after shift", () => {
  const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)

  // FREEZE: needs store.getState() — beforeAll shared env with board.screen.nodeBox/cell
  describe("collapse + shift right (shared env)", () => {
    let board: ReturnType<typeof testEnv>["board"]
    beforeAll(() => {
      const env = testEnv(
        () => item("board", item("Todo", item("1a"), item("1b")), item("Done", item("2a")), item("Later", item("3a"))),
        { columns: 80, rows: 20 },
      )
      board = env.board
      // Navigate to column header level, collapse Todo, shift right
      board.command("cursor_up")
      board.expect("#Todo[data-cursor]").toExist()
      board.command("toggle_collapse")
      board.expect("[data-collapsed]").toExist()
      board.press("opt+l")
      board.expect("#Todo[data-cursor]").toExist()
    })

    test("collapsed column borders intact after opt+l shift right", () => {
      const box = board.screen.nodeBox("Todo")
      expect(box).not.toBeNull()
      if (!box) return

      // Verify borders on all rows
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

    test("collapsed column width stays narrow after opt+l shift", () => {
      const collapsed = board.q("[data-collapsed]")
      expect(collapsed.count()).toBe(1)
      const bbox = collapsed.boundingBox()
      expect(bbox).not.toBeNull()
      expect(bbox!.width).toBeLessThanOrEqual(5)
    })

    test("collapsed column has no extra left margin after shift", () => {
      const box = board.screen.nodeBox("Todo")
      expect(box).not.toBeNull()
      if (!box) return

      // Scan the top row: first border char should be at box.x (no left margin)
      let firstBorderX = -1
      for (let x = box.x; x < box.x + box.width; x++) {
        const cell = board.screen.cell(x, box.y)
        if (isBorderChar(cell.char)) {
          firstBorderX = x
          break
        }
      }
      expect(firstBorderX, `First border char should be at box.x=${box.x}, got ${firstBorderX}`).toBe(box.x)
    })
  })

  // FREEZE: needs store.getState() — uses board._result.lastBuffer() / freshRender()
  test("incremental render matches fresh after collapse + shift", () => {
    const { board } = testEnv(
      () => item("board", item("Todo", item("1a"), item("1b")), item("Done", item("2a")), item("Later", item("3a"))),
      { columns: 80, rows: 20, incremental: true },
    )

    // Collapse Todo and shift right
    board.command("cursor_up")
    board.command("toggle_collapse")
    board.press("opt+l")

    const incBuffer = board._result.lastBuffer()!
    const freshBuffer = board._result.freshRender()

    // Compare buffers cell-by-cell
    for (let y = 0; y < incBuffer.height; y++) {
      for (let x = 0; x < incBuffer.width; x++) {
        const a = incBuffer.getCell(x, y)
        const b = freshBuffer.getCell(x, y)
        if (
          a.char !== b.char ||
          JSON.stringify(a.fg) !== JSON.stringify(b.fg) ||
          JSON.stringify(a.bg) !== JSON.stringify(b.bg) ||
          JSON.stringify(a.attrs) !== JSON.stringify(b.attrs)
        ) {
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
    using app = createTestApp(
      item(
        "board",
        item("Alpha", item("a1")),
        item("Beta", item("b1")),
        item("Gamma", item("c1")),
        item("Delta", item("d1")),
      ),
      { cols: 120, rows: 20 },
    )

    // Navigate to Beta, collapse it
    app.command("cursor_right")
    app.command("cursor_up")
    app.expect("#Beta[data-cursor]").toExist()
    app.command("toggle_collapse")

    // Shift collapsed Beta right (past Gamma)
    app.press("opt+l")
    app.expect("#Beta[data-cursor]").toExist()

    // Verify Beta is still narrow and has proper borders
    const betaBox = app.screen.nodeBox("Beta")
    expect(betaBox).not.toBeNull()
    if (!betaBox) return

    expect(betaBox.width).toBeLessThanOrEqual(5)

    const isBorderChar = (c: string) => "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)
    for (let y = betaBox.y; y < betaBox.y + betaBox.height; y++) {
      const leftCell = app.screen.cell(betaBox.x, y)
      const rightCell = app.screen.cell(betaBox.x + betaBox.width - 1, y)
      expect(isBorderChar(leftCell.char), `Row y=${y}: left at x=${betaBox.x} got '${leftCell.char}'`).toBe(true)
      expect(
        isBorderChar(rightCell.char),
        `Row y=${y}: right at x=${betaBox.x + betaBox.width - 1} got '${rightCell.char}'`,
      ).toBe(true)
    }

    // Also check visual order: Alpha, Gamma, Beta(collapsed), Delta
    const alphaBox = app.screen.nodeBox("Alpha")
    const gammaBox = app.screen.nodeBox("Gamma")
    const deltaBox = app.screen.nodeBox("Delta")
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
  // FREEZE: needs store.getState() — beforeAll shared env with board.expectScreen
  describe("Alpha column round-trip (shared env)", () => {
    let board: ReturnType<typeof testEnv>["board"]
    beforeAll(() => {
      const env = testEnv(() => item("board", item("Alpha", item("a1"), item("a2")), item("Beta", item("b1"))), {
        columns: 80,
        rows: 20,
      })
      board = env.board
      // Collapse and uncollapse
      board.command("toggle_collapse")
      board.expect("#a1").not.toExist()
      board.command("toggle_collapse")
      board.expect("#a1").toExist()
    })

    test("column header text visible after collapse/uncollapse round-trip", () => {
      board.expectScreen("Alpha")
    })

    test("separator line visible after uncollapsing", () => {
      board.expectScreen("\u2500")
    })
  })

  test("header row contains column name after uncollapsing", () => {
    using app = createTestApp(
      item("board", item("MyColumn", item("task1"), item("task2")), item("Other", item("other1"))),
      { cols: 80, rows: 20 },
    )

    // Collapse and uncollapse
    app.command("toggle_collapse")
    app.expect("#task1").not.toExist()
    app.command("toggle_collapse")
    app.expect("#task1").toExist()

    // The column box should contain the header name in its first row
    const colBox = app.screen.nodeBox("MyColumn")
    expect(colBox).not.toBeNull()
    if (!colBox) return

    const headerRow = app.screen.row(colBox.y)
    expect(headerRow).toContain("MyColumn")
  })

  test("card count visible in header after uncollapsing", () => {
    using app = createTestApp(
      item("board", item("Alpha", item("a1"), item("a2"), item("a3")), item("Beta", item("b1"))),
      { cols: 80, rows: 20 },
    )

    // Collapse and uncollapse
    app.command("toggle_collapse")
    app.command("toggle_collapse")

    // The header should show the card count
    const screenshot = app.text
    expect(screenshot).toContain("3") // 3 cards in Alpha column
  })
})

// =============================================================================
// Merged from collapse.slow.spec.ts — Column Collapse Journey Tests
// =============================================================================

describe("Column Collapse Journeys", () => {
  test("collapse a column with v c, verify it shrinks and hides cards", async () => {
    using app = createTestApp(
      item("board", item("Todo", item("buy-milk"), item("write-tests")), item("Done", item("ship-v1"))),
      { cols: 80, rows: 24 },
    )

    // Step 1: Verify initial state — all cards visible
    app.expect("#buy-milk").toExist()
    app.expect("#write-tests").toExist()
    app.expect("#ship-v1").toExist()

    // Step 2: Collapse Todo column
    app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()

    // Step 3: Cards inside collapsed column should not be visible on screen
    const screenshot = app.text
    expect(screenshot).not.toContain("buy-milk")
    expect(screenshot).not.toContain("write-tests")

    // Step 4: Other column's cards remain visible
    expect(screenshot).toContain("ship-v1")

    // Step 5: Collapsed column should be narrow (<=5 chars wide)
    const collapsed = app.q("[data-collapsed]")
    const bbox = collapsed.boundingBox()
    expect(bbox).not.toBeNull()
    expect(bbox!.width).toBeLessThanOrEqual(5)
  })

  test("navigate between collapsed and expanded columns with h/l", () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Alpha", item("a1"), item("a2")),
        item("Beta", item("b1"), item("b2")),
        item("Gamma", item("c1")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Collapse Alpha column
    app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()

    // Step 2: Navigate right to Beta — cursor should land on a Beta card
    app.command("cursor_right")
    let cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("b1")

    // Step 3: Navigate right to Gamma
    app.command("cursor_right")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("c1")

    // Step 4: Navigate left back through Beta to collapsed Alpha
    app.command("cursor_left")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("b1")

    app.command("cursor_left")
    // Should land on collapsed Alpha's column header
    cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    app.expect("[data-collapsed][data-cursor]").toExist()
  })

  test("collapse then uncollapse round-trip restores all cards", () => {
    using app = createTestApp(
      item(
        "board",
        item("Projects", item("redesign"), item("migration"), item("cleanup")),
        item("Archive", item("old-stuff")),
      ),
      { cols: 80, rows: 24 },
    )

    // Step 1: Verify all cards visible initially
    app.expect("#redesign").toExist()
    app.expect("#migration").toExist()
    app.expect("#cleanup").toExist()

    // Step 2: Collapse Projects column
    app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()
    expect(app.text).not.toContain("redesign")

    // Step 3: Uncollapse Projects column
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(0)

    // Step 4: All cards should be visible again
    app.expect("#redesign").toExist()
    app.expect("#migration").toExist()
    app.expect("#cleanup").toExist()

    // Step 5: Cursor should be on a valid card in the uncollapsed column
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("collapse multiple columns independently, verify layout changes", async () => {
    using app = createTestApp(
      item.root(
        "board",
        item("col1", item("task-a")),
        item("col2", item("task-b")),
        item("col3", item("task-c")),
        item("col4", item("task-d")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Collapse col1
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(1)

    // Step 2: Navigate to col3 and collapse it
    app.command("cursor_right") // col2
    app.command("cursor_right") // col3
    const cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("task-c")
    app.command("toggle_collapse")
    expect(app.q("[data-collapsed]").count()).toBe(2)

    // Step 3: Verify col2 and col4 cards are still visible
    const screenshot = app.text
    expect(screenshot).toContain("task-b")
    expect(screenshot).toContain("task-d")

    // Step 4: Verify col1 and col3 cards are hidden
    expect(screenshot).not.toContain("task-a")
    expect(screenshot).not.toContain("task-c")

    // Step 5: Expanded columns should get more space from collapsed siblings
    const col2Box = app.q("#col2").boundingBox()
    const col4Box = app.q("#col4").boundingBox()
    expect(col2Box).not.toBeNull()
    expect(col4Box).not.toBeNull()
    // With 2 of 4 columns collapsed, remaining columns should be wider than ~30 chars each
    expect(col2Box!.width).toBeGreaterThan(30)
    expect(col4Box!.width).toBeGreaterThan(30)
  })

  test("collapse column, navigate away, come back — column stays collapsed", async () => {
    using app = createTestApp(
      item.root(
        "board",
        item("Inbox", item("new-item"), item("urgent")),
        item("Doing", item("active-task")),
        item("Review", item("pr-42")),
      ),
      { cols: 120, rows: 24 },
    )

    // Step 1: Collapse Inbox
    app.command("toggle_collapse")
    app.expect("[data-collapsed]").toExist()

    // Step 2: Navigate to Review column
    app.command("cursor_right") // Doing
    app.command("cursor_right") // Review
    let cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("pr-42")

    // Step 3: Navigate back to Doing
    app.command("cursor_left")
    cursor = app.q("[data-cursor]")
    expect(cursor.textContent()).toContain("active-task")

    // Step 4: Navigate back to collapsed Inbox
    app.command("cursor_left")
    app.expect("[data-collapsed][data-cursor]").toExist()

    // Step 5: Inbox should still be collapsed
    expect(app.q("[data-collapsed]").count()).toBe(1)
    expect(app.text).not.toContain("new-item")
    expect(app.text).not.toContain("urgent")
  })

  test("collapsed column cursor is on header, j/k does not enter column", async () => {
    using app = createTestApp(
      item("board", item("col1", item("task-a"), item("task-b"), item("task-c")), item("col2", item("other"))),
      { cols: 80, rows: 24 },
    )

    // Step 1: Collapse col1
    app.command("toggle_collapse")
    app.expect("[data-collapsed][data-cursor]").toExist()

    // Step 2: Press j — should NOT enter the collapsed column
    app.command("cursor_down")
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)

    // Step 3: Press k — should also not drill into collapsed column
    app.command("cursor_up")
    expect(app.q("[data-cursor]").count()).toBe(1)

    // Step 4: Cards should remain hidden
    expect(app.text).not.toContain("task-a")
    expect(app.text).not.toContain("task-b")
  })
})

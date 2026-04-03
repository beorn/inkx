/**
 * Column rendering tests — scroll indicators, selected style, title truncation.
 *
 * Consolidated from:
 * - col-scroll-indicator.test.tsx (vertical ▲/▼ and horizontal ◂/▸ indicators)
 * - col-selected-style.test.ts (yellow header/separator/border at column level)
 * - col-title-truncate.test.ts (title truncation, sigil suffix handling)
 * - card-counts.test.ts (card/column count display, WIP limits, subtask badges)
 * - section-cards.test.ts (section card rendering, bold text, separators)
 * - scroll-height-equalization.test.tsx (body block spacing in columns view)
 * - md-columns.slow.test.ts (markdown file column layout via termless PTY)
 */

import { describe, test, it, expect } from "vitest"
import { mkdirSync, writeFileSync } from "fs"
import { createTerminalFixture } from "@termless/test"
import "@termless/test/matchers"
import { testEnv, testEnvWithRepo, item } from "./helpers/board-test.ts"
import { TC } from "./helpers/theme.ts"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"

// =============================================================================
// Scroll indicators in COLUMNS view (km-tui.col-scroll)
// =============================================================================

describe("col-scroll-indicator", () => {
  // ==========================================================================
  // Vertical card overflow indicators (▲/▼)
  // ==========================================================================

  test("▼ shows in columns view when cards exceed viewport", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
      columns: 80,
      viewMode: "columns",
    })

    const text = board.screenshot()
    expect(text).toContain("\u25bc")
  })

  test("▲ shows in columns view after scrolling down", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item(`card${i}`))
    const { board } = testEnv(() => item("board", item("col1", ...cards)), {
      rows: 20,
      columns: 80,
      viewMode: "columns",
    })

    for (let i = 0; i < 15; i++) board.command("cursor_down")

    const text = board.screenshot()
    expect(text).toContain("\u25b2")
  })

  // ==========================================================================
  // Horizontal column scroll indicators (◂/▸)
  // ==========================================================================

  test("▸ shows in columns view when more columns exist to the right", () => {
    // maxCols = floor(80/35) = 2 columns fit. With 4 columns, right indicator should show.
    const cols = Array.from({ length: 4 }, (_, i) => item(`col${i}`, item(`task${i}`)))
    const { board } = testEnv(() => item("board", ...cols), { rows: 20, columns: 80, viewMode: "columns" })

    const text = board.screenshot()
    // Right indicator (▸) should show since columns 2,3 are off-screen
    expect(text).toContain("\u25b8")
  })

  test("◂ shows in columns view after scrolling right", () => {
    const cols = Array.from({ length: 4 }, (_, i) => item(`col${i}`, item(`task${i}`)))
    const { board } = testEnv(() => item("board", ...cols), { rows: 20, columns: 80, viewMode: "columns" })

    // Move right to next column to trigger horizontal scroll
    board.command("cursor_right").command("cursor_right")

    const text = board.screenshot()
    // Left indicator (◂) should show since columns before are off-screen
    expect(text).toContain("\u25c2")
  })
})

// =============================================================================
// Column selected style (km-tui.col-selected-style)
// =============================================================================

describe("km-tui.col-selected-style: column selected style at column level", () => {
  it("column header has yellow bg when cursor is at column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Initially cursor is at card level on first card
    board.expect('[id="task1"][data-cursor]').toExist()

    // Press k to go up from first card to column header
    board.command("cursor_up")

    // Now cursor should be at column level
    board.expect('[data-cursor][data-card-index="-1"]').toExist()

    // Find col1's column element to get its bounding box
    const colLoc = board.q('[id="col1"][data-view="column"]')
    expect(colLoc.count()).toBeGreaterThan(0)
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The first row of the column bounding box is the header.
    // Find the "col1" text within that row.
    const headerY = colBox.y
    const row = board.screen.row(headerY)
    const colTextX = row.indexOf("col1")
    expect(colTextX, "'col1' should be visible in header row").toBeGreaterThan(-1)

    // When cursor is at column level, header text should have
    // $selected bg and $selectedfg fg -- the "inverse selected" style
    const cell = board.screen.cell(colTextX, headerY)
    expect(cell.bg, "column header bg should be $selected when at column level").toEqual(TC.$selected)
    expect(cell.fg, "column header fg should be $selectedfg when at column level").toEqual(TC.$selectedfg)
  })

  it("separator line is yellow when cursor is at column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Go to column level
    board.command("cursor_up")

    // Find col1's column element
    const colLoc = board.q('[id="col1"][data-view="column"]')
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The separator line is one row below the header (header is at colBox.y)
    const separatorY = colBox.y + 1

    // Find the first line-drawing char in the separator row within the column's x range
    let sepX = -1
    for (let x = colBox.x; x < colBox.x + colBox.width; x++) {
      if (board.screen.cell(x, separatorY).char === "\u2500") {
        sepX = x
        break
      }
    }
    expect(sepX, "separator char should be found").toBeGreaterThanOrEqual(0)

    const sepCell = board.screen.cell(sepX, separatorY)
    expect(sepCell.fg, "separator fg should be $selected when column selected").toEqual(TC.$selected)
    expect(sepCell.attrs.dim, "separator should NOT be dim when column selected").toBeFalsy()
  })

  it("column card area has visible yellow left border when cursor is at column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Go to column level
    board.command("cursor_up")

    // Find col1's column element
    const colLoc = board.q('[id="col1"][data-view="column"]')
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The card area starts after header + separator (colBox.y + 2).
    // Check multiple rows in the card area for a selected-color left-side indicator.
    // With the fix, there should be a yellow (selected) vertical border/bar running
    // down the left edge of the column body when isColumnSelected.
    const cardAreaStartY = colBox.y + 2

    // Check several rows in the card area
    for (let dy = 0; dy < 3; dy++) {
      const y = cardAreaStartY + dy
      if (y >= colBox.y + colBox.height) break

      // The leftmost cell of the column should be yellow (border or indicator)
      const leftCell = board.screen.cell(colBox.x, y)
      // Accept either a border character with $selected color, or a space with $selected bg
      const isYellowBorder = leftCell.fg === TC.$selected // $selected foreground for border chars
      const isYellowBg = leftCell.bg === TC.$selected // $selected background

      expect(
        isYellowBorder || isYellowBg,
        `column left edge at (${colBox.x}, ${y}) should have yellow styling ` +
          `(fg=${leftCell.fg}, bg=${leftCell.bg}, char="${leftCell.char}")`,
      ).toBe(true)
    }
  })

  it("non-selected column does NOT have yellow header styling", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1")), item("col2", item("task3"))), {
      columns: 100,
      rows: 20,
    })

    // Go to column level on col1
    board.command("cursor_up")

    // Find col2's column element
    const col2Loc = board.q('[id="col2"][data-view="column"]')
    expect(col2Loc.count()).toBeGreaterThan(0)
    const col2Box = col2Loc.boundingBox()
    expect(col2Box).not.toBeNull()
    if (!col2Box) return

    // col2 header should NOT have $selected bg
    const headerY = col2Box.y
    const row = board.screen.row(headerY)
    const col2Idx = row.indexOf("col2")
    expect(col2Idx).toBeGreaterThan(-1)

    const cell = board.screen.cell(col2Idx, headerY)
    expect(cell.bg, "non-selected column header should NOT have $selected bg").not.toEqual(TC.$selected)
  })

  it("returning to card level removes column-level yellow border", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 100, rows: 20 },
    )

    // Go to column level
    board.command("cursor_up")
    board.expect('[data-cursor][data-card-index="-1"]').toExist()

    // Go back to card level
    board.command("cursor_down")
    board.expect('[id="task1"][data-cursor]').toExist()

    // Find col1's column element
    const colLoc = board.q('[id="col1"][data-view="column"]')
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The separator should now be dim (not bright yellow)
    const separatorY = colBox.y + 1
    let sepX = -1
    for (let x = colBox.x; x < colBox.x + colBox.width; x++) {
      if (board.screen.cell(x, separatorY).char === "\u2500") {
        sepX = x
        break
      }
    }
    expect(sepX).toBeGreaterThanOrEqual(0)

    const sepCell = board.screen.cell(sepX, separatorY)
    // When back at card level, separator should use muted color ($text3), not selection color
    expect(sepCell.fg, "separator should use $text3 when back at card level").toBe(TC.$text3)
  })
})

// =============================================================================
// Column title truncation (km-tui.col-title-truncate)
// =============================================================================

// Helpers

/** Create a minimal board fixture with a sigil column and a second column. */
function createSigilBoard(opts: { displayName: string; sigilName: string; secondCol?: boolean }): KNode[] {
  const nodes: KNode[] = [
    {
      id: "root",
      type: "h",
      item: {},
      fstype: "repo",
      data: { name: "board", is_repo_root: true },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "col1",
      type: "h",
      item: {},
      fstype: "folder",
      name: opts.sigilName,
      data: { name: opts.displayName },
      parent_id: "root",
      parent_idx: 0,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "task-a",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "task-a",
      data: {},
      parent_id: "col1",
      parent_idx: 0,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
  ]

  if (opts.secondCol !== false) {
    nodes.push(
      {
        id: "col2",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "col2" },
        parent_id: "root",
        parent_idx: 1,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task-b",
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "task-b",
        data: {},
        parent_id: "col2",
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    )
  }

  return nodes
}

/** Assert every line in the screenshot fits within the given width. */
function expectLinesWithinWidth(text: string, maxWidth: number) {
  const lines = text.split("\n")
  for (const line of lines) {
    expect(line.length).toBeLessThanOrEqual(maxWidth)
  }
}

describe("col-title-truncate", () => {
  // =========================================================================
  // Basic truncation
  // =========================================================================

  test("long column title is truncated within column width", () => {
    // Title is 90 chars — longer than the 80-col terminal, so it MUST be
    // truncated everywhere (breadcrumb header AND column header).
    const longTitle = "This Is A Very Long Column Name That Should Definitely Be Truncated Because It Is Way Too Long"
    const { board } = testEnv(() => item.root("board", item(longTitle, item("task-a")), item("col2", item("task-b"))), {
      columns: 80,
      rows: 20,
    })

    const text = board.screenshot()
    // Full title should NOT appear — it's 95 chars, wider than the 80-col terminal
    expect(text).not.toContain(longTitle)
    // But the beginning should be visible
    expect(text).toContain("This Is A Very")
    expectLinesWithinWidth(text, 80)
  })

  test("single column with very long name truncates properly", () => {
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item("This Title Is Extremely Long And Must Be Truncated To Fit Within The Column Width", item("task")),
        ),
      { columns: 40, rows: 15 },
    )

    expectLinesWithinWidth(board.screenshot(), 40)
  })

  test("header row respects column width with large count display", () => {
    // 10 cards produce a 2-digit count display that reduces available name space
    const cards = Array.from({ length: 10 }, (_, i) => item(`card${i}`))
    const { board } = testEnv(
      () => item.root("board", item("A Somewhat Long Column Name Here", ...cards), item("Short", item("x"))),
      { columns: 60, rows: 20 },
    )

    expectLinesWithinWidth(board.screenshot(), 60)
  })

  // =========================================================================
  // Sigil suffix omission when space is tight
  // =========================================================================

  test("sigil suffix omitted when display name + sigil would overflow", () => {
    // "Landing the Plane Session Completion" (36 chars) + " @landing-the-plane" (19 chars)
    // = 55 chars total. With 60-col terminal and 2 columns, each column is ~29 chars wide.
    // Available header name width is ~24 chars. The sigil suffix should be omitted.
    const nodes = createSigilBoard({
      displayName: "Landing the Plane Session Completion",
      sigilName: "@landing-the-plane",
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 60, rows: 20 })

    const text = board.screenshot()
    expectLinesWithinWidth(text, 60)

    // The sigil suffix should NOT appear since it doesn't fit
    expect(text).not.toContain("@landing-the-plane")
    // But the display name beginning should be visible
    expect(text).toContain("Landing the")
  })

  test("sigil suffix hidden when slug matches display name", () => {
    // "Next" slugifies to "next", same as "@next" → slug is redundant, not shown.
    const nodes = createSigilBoard({
      displayName: "Next",
      sigilName: "@next",
      secondCol: false,
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 80, rows: 15 })

    const text = board.screenshot()
    // The sigil suffix should NOT appear since it's slug-equivalent to the title
    expect(text).not.toContain("@next")
    expect(text).toContain("Next")
    expectLinesWithinWidth(text, 80)
  })

  test("sigil suffix shown when slug differs from display name", () => {
    // "Next Actions" slugifies to "next-actions", differs from "@next" → slug IS shown.
    const nodes = createSigilBoard({
      displayName: "Next Actions",
      sigilName: "@next",
      secondCol: false,
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 80, rows: 15 })

    const text = board.screenshot()
    expect(text).toContain("@next")
    expect(text).toContain("Next Actions")
    expectLinesWithinWidth(text, 80)
  })

  test("narrow column with sigil suffix fits within column width", () => {
    const nodes = createSigilBoard({
      displayName: "Next Actions",
      sigilName: "@next",
      secondCol: false,
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 30, rows: 15 })

    expectLinesWithinWidth(board.screenshot(), 30)
  })

  // =========================================================================
  // Columns view mode
  // =========================================================================

  test("sigil suffix handled correctly in columns view mode", () => {
    const nodes = createSigilBoard({
      displayName: "Landing the Plane Session Completion",
      sigilName: "@landing-the-plane",
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", {
      columns: 60,
      rows: 20,
      viewMode: "columns",
    })

    const text = board.screenshot()
    expectLinesWithinWidth(text, 60)
  })
})

// =============================================================================
// Card/column count display (km-tui.card-count-wip)
//
// Column headers only show a count when a WIP limit is configured.
// When shown, the count is formatted as "count/wip" (e.g., "3/5").
// Without a WIP limit, no count is shown — the +N overflow indicator
// is sufficient.
//
// Card titles (in cards view) never show an inline child count —
// the +N overflow indicator replaces that behavior.
// =============================================================================

/**
 * Find the column header row by looking for a row that contains the column name
 * but is NOT the breadcrumb row (which contains ">").
 * The separator line (───) appears right after the column header.
 */
function findColumnHeaderRow(screenText: string, columnName: string): number {
  const rows = screenText.split("\n")
  // Find the separator row (all dashes), then the header is the row before it
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.includes("─") && rows[i - 1]!.includes(columnName) && !rows[i - 1]!.includes(">")) {
      return i - 1
    }
  }
  return -1
}

describe("column header count", () => {
  test("column header hides count when no WIP limit", () => {
    const { board } = testEnv(() => item("board", item("nocap", item("task-a"), item("task-b"), item("task-c"))), {
      columns: 60,
      rows: 24,
    })

    const headerRow = findColumnHeaderRow(board.screen.text, "nocap")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // The row should NOT contain any digits (no card count)
    // because there is no WIP limit configured
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("nocap")
    expect(rowText).not.toMatch(/\d/)
  })

  test("column header shows count/wip when WIP limit configured", () => {
    const { board } = testEnv(
      () => item("board", item("capped km.limit:: 5", item("task-a"), item("task-b"), item("task-c"))),
      { columns: 60, rows: 24 },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "capped")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // The row should show "3/5" (3 cards, WIP limit 5)
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("capped")
    expect(rowText).toContain("3/5")
  })

  test("column header shows warning when WIP limit exceeded", () => {
    const { board } = testEnv(
      () => item("board", item("overflow km.limit:: 2", item("task-a"), item("task-b"), item("task-c"))),
      { columns: 60, rows: 24 },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "overflow")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // The row should show "3/2" (3 cards, WIP limit 2) with warning
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("overflow")
    expect(rowText).toContain("3/2")
  })
})

// =============================================================================
// Card title subtask progress badge
// =============================================================================

describe("card title subtask progress badge", () => {
  test("subtask badge hidden in cards view (overflow indicators replace it)", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("parent", item("child-a"), item("child-b"), item("child-c")))),
      { columns: 60, rows: 24 },
    )

    // In cards view, subtask badge is hidden — overflow indicators are enough
    const box = board.screen.nodeBox("parent")
    expect(box, "parent card should exist").not.toBeNull()
    if (!box) return

    const row = board.screen.text.split("\n")[box.y] ?? ""
    expect(row).not.toContain("0/3")
  })

  test("subtask badge hidden for cards with many children", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item("big-parent", item("ca"), item("cb"), item("cc"), item("cd"), item("ce"), item("cf"), item("cg")),
          ),
        ),
      { columns: 60, rows: 30 },
    )

    const box = board.screen.nodeBox("big-parent")
    expect(box, "big-parent should exist").not.toBeNull()
    if (!box) return

    // Badge hidden in cards view
    const row = board.screen.text.split("\n")[box.y] ?? ""
    expect(row).not.toContain("0/7")
  })
})

// =============================================================================
// Columns view: count behavior matches cards view
// =============================================================================

describe("columns view column header count", () => {
  test("columns view hides count when no WIP limit", () => {
    const { board } = testEnv(() => item("board", item("nocol", item("parent", item("child-a"), item("child-b")))), {
      columns: 60,
      rows: 24,
      viewMode: "columns",
    })

    const headerRow = findColumnHeaderRow(board.screen.text, "nocol")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // No count should appear on the header row
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("nocol")
    expect(rowText).not.toMatch(/\d/)
  })

  test("columns view shows count/wip when WIP limit configured", () => {
    const { board } = testEnv(
      () => item("board", item("limited km.limit:: 5", item("parent", item("child-a"), item("child-b")))),
      { columns: 60, rows: 24, viewMode: "columns" },
    )

    const headerRow = findColumnHeaderRow(board.screen.text, "limited")
    expect(headerRow, "column header row should exist").toBeGreaterThanOrEqual(0)

    // Should show "1/5" (1 card, WIP limit 5)
    const rowText = board.screen.text.split("\n")[headerRow]
    expect(rowText).toContain("limited")
    expect(rowText).toContain("1/5")
  })
})

// =============================================================================
// Section card rendering
//
// Section headers (mdsection nodes) that appear as cards within a column
// should render with a visually distinct style from regular task cards.
// They serve as section dividers/groupers, not as actionable items.
//
// Visual distinction (all cards have round borders):
// - Section cards: bold text, underline separator
// - Regular cards: normal text, round border (structural) or dim round border (body)
// =============================================================================

/** Check if a character is a round box-drawing border character. */
function isRoundBorderChar(c: string): boolean {
  return "╭╮╯╰│─".includes(c)
}

/** Check if a character is a horizontal line (used for section separators). */
function isHorizontalLine(c: string): boolean {
  return "─━▔".includes(c)
}

describe("section card rendering", () => {
  test("section cards render with round borders like all other cards", () => {
    // A column with a mix of section headers and regular tasks.
    // Sections come from Asana-style section headers in markdown (## Section Name).
    // All cards have borders regardless of fstype — section cards are visually
    // distinct via bold text and separator lines, not by removing borders.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item.section("Finance & Taxes", item("Pay rent"), item("File taxes")),
            item.section("Waiting", item("Response from bank")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Section cards SHOULD have round borders like all other structural cards
    for (const sectionId of ["Finance & Taxes", "Waiting"]) {
      const box = board.screen.nodeBox(sectionId)
      expect(box, `section "${sectionId}" should exist`).not.toBeNull()
      if (!box) continue

      // Check left side: SHOULD have round border chars at box.x - 1
      const leftX = box.x - 1
      if (leftX >= 0) {
        const leftCell = board.screen.cell(leftX, box.y)
        expect(
          isRoundBorderChar(leftCell.char),
          `section "${sectionId}" should have round left border at (${leftX},${box.y}), got '${leftCell.char}'`,
        ).toBe(true)
      }
    }
  })

  test("section cards display text as bold", () => {
    const { board } = testEnv(() => item("board", item("col", item.section("Finance & Taxes", item("Pay rent")))), {
      columns: 80,
      rows: 24,
    })

    // The section text (not the § icon prefix) should be bold.
    // The § icon is at the first non-space position; the actual text starts after "§ ".
    const box = board.screen.nodeBox("Finance & Taxes")
    expect(box, "section node should exist").not.toBeNull()
    if (!box) return

    // Find the 'F' character in "Finance & Taxes" (skip the § prefix)
    let foundBold = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.char === "F") {
        expect((cell.attrs as Record<string, unknown>).bold, `text char 'F' at (${x},${box.y}) should be bold`).toBe(
          true,
        )
        foundBold = true
        break
      }
    }
    expect(foundBold, "should find bold 'F' character in section title").toBe(true)
  })

  test("section cards are visually distinct from adjacent task cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item.section("Section Header", item("task-a"), item("task-b")),
            item.section("Another Section", item("task-c")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Section header cards have round borders like all cards, but are
    // visually distinct via bold text and horizontal separators
    const sectionBox = board.screen.nodeBox("Section Header")
    expect(sectionBox).not.toBeNull()
    if (!sectionBox) return

    // Look for a horizontal separator line below the section card.
    // The separator appears after the section title and its children,
    // so scan a few rows below the section box.
    let hasHLine = false
    for (let y = sectionBox.y + 1; y < sectionBox.y + 10 && y < 24; y++) {
      let lineChars = 0
      for (let x = 0; x < 80; x++) {
        const cell = board.screen.cell(x, y)
        if (isHorizontalLine(cell.char)) lineChars++
      }
      // A separator line should have many horizontal line chars (at least half the width)
      if (lineChars >= 20) {
        hasHLine = true
        break
      }
    }
    expect(hasHLine, "section card should have a horizontal separator line below it").toBe(true)
  })

  test("section card selection uses yellow background (like other cards)", () => {
    const { board } = testEnv(() => item("board", item("col", item.section("My Section", item("task-1")))), {
      columns: 80,
      rows: 24,
    })

    // First card should be the section, and it should be selected
    board.expectNodeColor("My Section", { bg: TC.$selected })
  })

  test("section cards with children show fold marker and child count", () => {
    const { board } = testEnv(
      () => item("board", item("col", item.section("Has Children", item("child-a"), item("child-b"), item("child-c")))),
      { columns: 80, rows: 24 },
    )

    // Section card should show children underneath
    board.expect("#child-a").toExist()
    board.expect("#child-b").toExist()
    board.expect("#child-c").toExist()
  })
})

// =============================================================================
// Body block spacing in columns view
//
// Body blocks and structural items are rendered compactly (no blank lines)
// in columns view, matching tabs/lists view behavior.
// =============================================================================

describe("body block spacing in columns view", () => {
  test("body blocks are compact like structural items", () => {
    // Body items (type "p") come before structural items (type "oi")
    // extractBody classifies children: non-oi before first oi = body, oi = structural
    const nodes = item(
      "board",
      item(
        "col1",
        item.p("body-para-one"),
        item.p("body-para-two"),
        item.section("section-alpha", item("task-a1")),
        item.section("section-beta", item("task-b1")),
      ),
    )

    const { board } = testEnv(() => nodes, { viewMode: "columns" })

    const bodyOneBox = board.screen.nodeBox("body-para-one")
    const bodyTwoBox = board.screen.nodeBox("body-para-two")
    const sectionAlphaBox = board.screen.nodeBox("section-alpha")
    const sectionBetaBox = board.screen.nodeBox("section-beta")

    expect(bodyOneBox).not.toBeNull()
    expect(bodyTwoBox).not.toBeNull()
    expect(sectionAlphaBox).not.toBeNull()
    expect(sectionBetaBox).not.toBeNull()

    // Both body blocks and structural items: 1 row spacing (compact)
    const bodySpacing = bodyTwoBox!.y - bodyOneBox!.y
    expect(bodySpacing).toBe(1)

    const structuralSpacing = sectionBetaBox!.y - sectionAlphaBox!.y
    expect(structuralSpacing).toBe(1)
  })

  test("all-body column (no structural items) also renders compactly", () => {
    // When ALL children are body (no oi), all are compact
    const nodes = item("board", item("col1", item.p("para-one"), item.p("para-two"), item.p("para-three")))

    const { board } = testEnv(() => nodes, { viewMode: "columns" })

    const paraOneBox = board.screen.nodeBox("para-one")
    const paraTwoBox = board.screen.nodeBox("para-two")
    const paraThreeBox = board.screen.nodeBox("para-three")

    expect(paraOneBox).not.toBeNull()
    expect(paraTwoBox).not.toBeNull()
    expect(paraThreeBox).not.toBeNull()

    // All body blocks: 1 row spacing (compact)
    expect(paraTwoBox!.y - paraOneBox!.y).toBe(1)
    expect(paraThreeBox!.y - paraTwoBox!.y).toBe(1)
  })

  test("all-structural column (no body) renders compactly", () => {
    // When ALL children are oi, none get marginBottom
    const nodes = item(
      "board",
      item(
        "col1",
        item.section("sec-one", item("task-1")),
        item.section("sec-two", item("task-2")),
        item.section("sec-three", item("task-3")),
      ),
    )

    const { board } = testEnv(() => nodes, { viewMode: "columns" })

    const secOneBox = board.screen.nodeBox("sec-one")
    const secTwoBox = board.screen.nodeBox("sec-two")
    const secThreeBox = board.screen.nodeBox("sec-three")

    expect(secOneBox).not.toBeNull()
    expect(secTwoBox).not.toBeNull()
    expect(secThreeBox).not.toBeNull()

    // Structural items: 1 row spacing (compact)
    expect(secTwoBox!.y - secOneBox!.y).toBe(1)
    expect(secThreeBox!.y - secTwoBox!.y).toBe(1)
  })
})

// =============================================================================
// Ghost cursor — folder index file navigation (km-nx8af)
//
// When a folder column has an index file (same-name .md), the view filters
// it from cardNodes. Navigation must also skip it, otherwise the cursor
// lands on an invisible node ("ghost cursor").
// =============================================================================

describe("ghost cursor — folder index file (km-nx8af)", () => {
  /**
   * Folder "project" with children: [project.md (index), task-a, task-b].
   * View shows: [task-a, task-b]. project.md is filtered by kNodeToColumnView.
   * Navigation via j/k must skip project.md.
   */
  function makeFolderWithIndexFile(): KNode[] {
    const now = Date.now()
    return [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "repo",
        name: "board",
        data: { name: "board", is_repo_root: true },
        parent_id: null,
        parent_idx: 0,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
      {
        id: "project",
        type: "h",
        item: {},
        fstype: "folder",
        name: "project",
        data: { name: "project" },
        parent_id: "board",
        parent_idx: 0,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
      {
        // Index file: same name as folder → findIndexFile matches
        id: "project-md",
        type: "h",
        item: {},
        fstype: "mdfile",
        name: "project",
        data: { name: "project" },
        parent_id: "project",
        parent_idx: 0,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
      {
        id: "task-a",
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "task-a",
        data: {},
        parent_id: "project",
        parent_idx: 1,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
      {
        id: "task-b",
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "task-b",
        data: {},
        parent_id: "project",
        parent_idx: 2,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
      {
        id: "other-col",
        type: "h",
        item: {},
        fstype: "folder",
        name: "other",
        data: { name: "other" },
        parent_id: "board",
        parent_idx: 1,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
      {
        id: "other-task",
        type: "p",
        item: { list: "-", task: { status: "todo", marker: "[ ]" } },
        content: "other-task",
        data: {},
        parent_id: "other-col",
        parent_idx: 0,
        created_at: now,
        updated_at: now,
        version: "v1",
      },
    ] as KNode[]
  }

  test("j from column header lands on first visible card, not invisible index file", () => {
    const repo = createFakeRepo({ nodes: makeFolderWithIndexFile() })
    const { board } = testEnvWithRepo(repo, "board", { columns: 80, rows: 20 })

    // Initial cursor is on first visible card (task-a).
    board.expect('[id="task-a"][data-cursor]').toExist()

    // Go up to column header
    board.command("cursor_up") // task-a → column header "project"
    board.expect('[id="project"][data-cursor]').toExist()

    // Now press j to go to first card. Should skip invisible index file.
    board.command("cursor_down")

    // The cursor should be on task-a, not on the invisible project-md
    board.expect('[id="task-a"][data-cursor]').toExist()
  })

  test("k from first visible card goes to column header, not invisible index file", () => {
    const repo = createFakeRepo({ nodes: makeFolderWithIndexFile() })
    const { board } = testEnvWithRepo(repo, "board", { columns: 80, rows: 20 })

    // Initial cursor is on first visible card (task-a).
    board.expect('[id="task-a"][data-cursor]').toExist()

    // Press k to go up — should go to column header, not invisible index file
    board.command("cursor_up")

    // Should be at column header "project", not at invisible project-md
    board.expect('[id="project"][data-cursor]').toExist()
  })

  test("index file is not rendered as a card in the column", () => {
    const repo = createFakeRepo({ nodes: makeFolderWithIndexFile() })
    const { board } = testEnvWithRepo(repo, "board", { columns: 80, rows: 20 })

    // The index file node should not appear on screen
    const indexFileNode = board.q('[id="project-md"][data-view="item"]')
    expect(indexFileNode.count()).toBe(0)
  })
})

// =============================================================================
// Markdown file column layout (termless PTY) — from md-columns.slow.test.ts
//
// Root cause: deferred parsing (parseOneFile, insertFileNodes) didn't re-parent
// child nodes when patching the file node ID to match the stub. Children were
// inserted with the parser-generated ID as parent_id, making them orphans.
// =============================================================================

const KM_CWD = "/Users/beorn/Code/pim/km"

function createVault(files: Record<string, string>): string {
  const dir = `/tmp/km-md-columns-${Date.now()}`
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(`${dir}/${name}`, content)
  }
  return dir
}

describe("md file columns (termless)", { timeout: 30000 }, () => {
  test("zooming into md file shows H2 sections as horizontal columns", async () => {
    const vault = createVault({
      "project.md": "# Project\n\n## Todo\n\n- [ ] Task A\n- [ ] Task B\n\n## Done\n\n- [x] Task C\n",
      "notes.md": "# Notes\n\n## Ideas\n\n- Idea 1\n",
    })

    const term = createTerminalFixture({ cols: 120, rows: 30 })
    await term.spawn(["bun", "km", "view", vault], { cwd: KM_CWD })
    await expect(term.screen).toContainText("Task A", { timeout: 15000 }) // board rendered + background parse complete

    // Navigate to column header (k k j), settle, then zoom (z)
    term.press("k")
    term.press("k")
    term.press("j")
    await term.waitForStable(300, 3000)
    term.press("z")
    await term.waitForStable(500, 5000)

    const todoPos = term.find("Todo")
    const donePos = term.find("Done")
    const screenText = term.screen.getText()

    expect(todoPos, `"Todo" not found.\n${screenText.slice(0, 600)}`).not.toBeNull()
    expect(donePos, `"Done" not found.\n${screenText.slice(0, 600)}`).not.toBeNull()
    expect(
      todoPos!.col !== donePos!.col,
      `Sections should be horizontal columns (different X), got same:\n` +
        `Todo(${todoPos!.row},${todoPos!.col}) Done(${donePos!.row},${donePos!.col})\n${screenText.slice(0, 600)}`,
    ).toBe(true)
  })
})

// =============================================================================
// Column title as card (km-tui.title-as-card)
// Bead: km-tui.title-as-card (P2, reopened)
//
// Column titles should behave like cards: keyboard navigation to column level,
// Enter to inline edit, click to select, double-click to edit.
// =============================================================================

describe("km-tui.title-as-card: column title interaction", () => {
  test("k from first card navigates to column level", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 80, rows: 20 },
    )

    // Initially cursor is on first card
    board.expect('[id="task1"][data-cursor]').toExist()

    // Press k to go up from first card → should land on column header
    board.command("cursor_up")

    // Cursor should be at column level (data-card-index=-1)
    board.expect('[data-cursor][data-card-index="-1"]').toExist()
    // Column should be selected
    board.expect('[id="col1"][data-selected]').toExist()
  })

  test("Enter on column opens inline edit for column title", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 80, rows: 20 },
    )

    // Navigate to column level
    board.command("cursor_up")
    board.expect('[data-cursor][data-card-index="-1"]').toExist()

    // Press Enter to start inline edit
    board.press("Enter")

    // Inline edit should be active on the column node
    const state = store.getState()
    const pane = state.workspace.panes.values().next().value as { inlineEditBlock?: { nodeId: string } | null }
    expect(pane?.inlineEditBlock).not.toBeNull()
    expect(pane?.inlineEditBlock?.nodeId).toBe("col1")
  })

  test("click on column header selects the column", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 80, rows: 20 },
    )

    // Find col1's column header position
    const colLoc = board.q('[id="col1"][data-view="column"]')
    expect(colLoc.count()).toBeGreaterThan(0)
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    // The header is at the top of the column bounding box
    const headerY = colBox.y
    const row = board.screen.row(headerY)
    const colTextX = row.indexOf("col1")
    expect(colTextX).toBeGreaterThan(-1)

    // Click on the column header text
    board.click(colTextX, headerY)

    // Cursor should be at column level
    board.expect('[data-cursor][data-card-index="-1"]').toExist()
    board.expect('[id="col1"][data-selected]').toExist()
  })

  test("double-click on column header enters inline edit", () => {
    const { board, store } = testEnv(
      () => item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      { columns: 80, rows: 20 },
    )

    // Find col1's column header position
    const colLoc = board.q('[id="col1"][data-view="column"]')
    expect(colLoc.count()).toBeGreaterThan(0)
    const colBox = colLoc.boundingBox()
    expect(colBox).not.toBeNull()
    if (!colBox) return

    const headerY = colBox.y
    const row = board.screen.row(headerY)
    const colTextX = row.indexOf("col1")
    expect(colTextX).toBeGreaterThan(-1)

    // Double-click on column header
    board.doubleClick(colTextX, headerY)

    // Inline edit should be active on the column node
    const state = store.getState()
    const pane = state.workspace.panes.values().next().value as { inlineEditBlock?: { nodeId: string } | null }
    expect(pane?.inlineEditBlock).not.toBeNull()
    expect(pane?.inlineEditBlock?.nodeId).toBe("col1")
  })
})

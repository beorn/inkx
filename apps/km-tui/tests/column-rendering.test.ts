/**
 * Column rendering tests — scroll indicators, selected style, title truncation.
 *
 * Consolidated from:
 * - col-scroll-indicator.test.tsx (vertical ▲/▼ and horizontal ◂/▸ indicators)
 * - col-selected-style.test.ts (yellow header/separator/border at column level)
 * - col-title-truncate.test.ts (title truncation, sigil suffix handling)
 */

import { describe, test, it, expect } from "vitest"
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

    for (let i = 0; i < 15; i++) board.press("j")

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
    board.press("l").press("l")

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
    board.press("k")

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
    board.press("k")

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
    board.press("k")

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
    board.press("k")

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
    board.press("k")
    board.expect('[data-cursor][data-card-index="-1"]').toExist()

    // Go back to card level
    board.press("j")
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
      item: true,
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
      item: true,
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
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
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
        item: true,
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
        item: true,
        list_marker: "-",
        task_marker: "[ ]",
        task_status: "todo",
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

/**
 * Card rendering tests.
 *
 * Covers card borders (structural and body cards), overflow indicators,
 * line truncation, and layout stability across various scenarios:
 * scrolling, narrow terminals, multi-column layouts, and collapsed columns.
 *
 * Two card styles:
 * - Structural cards (oi/sections): always have borders
 * - Virtual body cards (li/p/hr): always have borders (dim gray when unselected,
 *   yellow when selected, cyan when editing)
 *
 * NOTE: app.screen.nodeBox("id") returns the TreeNode content area
 * INSIDE the Card's border. The Card border is 1 cell outside:
 * - Left border: box.x - 1
 * - Right border: box.x + box.width
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp, type TestApp } from "./helpers/test-app.ts"
import { stripAnsi } from "@silvery/test"
import { displayWidth, graphemeWidth } from "@silvery/ag-react"

// ─── Card Border Helpers ─────────────────────────────────────────────────────

/** Minimal board-like interface shared between testEnv board and TestApp. */
interface BoardLike {
  screen: {
    nodeBox(nodeId: string): { x: number; y: number; width: number; height: number } | null
    cell(x: number, y: number): { char: string; fg: unknown; bg?: unknown }
  }
}

/** Check if a character is a box-drawing border character. */
function isBorderChar(c: string): boolean {
  return "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)
}

/**
 * Assert that the Card border has proper border chars at correct positions.
 * Checks 1 cell outside the nodeBox (where the Card's Box border renders).
 */
function expectCardBorder(board: BoardLike, nodeId: string, termWidth: number) {
  const box = board.screen.nodeBox(nodeId)
  expect(box, `node "${nodeId}" should exist`).not.toBeNull()
  if (!box) return

  const borderLeft = box.x - 1
  const borderRight = box.x + box.width

  for (let y = box.y; y < box.y + box.height; y++) {
    if (borderLeft >= 0) {
      const leftCell = board.screen.cell(borderLeft, y)
      expect(
        isBorderChar(leftCell.char),
        `node "${nodeId}" left border at (${borderLeft},${y}): got '${leftCell.char}'`,
      ).toBe(true)
    }
    if (borderRight < termWidth) {
      const rightCell = board.screen.cell(borderRight, y)
      expect(
        isBorderChar(rightCell.char),
        `node "${nodeId}" right border at (${borderRight},${y}): got '${rightCell.char}'`,
      ).toBe(true)
    }
  }
}

/**
 * Find the border cell for a body card by scanning left from the nodeBox.
 * Body cards always render a border (for layout stability), so the border
 * char may be at box.x - 1 or box.x - 2 depending on internal padding.
 */
function findBorderCell(board: BoardLike, nodeId: string): { char: string; fg: unknown } | null {
  const box = board.screen.nodeBox(nodeId)
  if (!box) return null
  for (let x = box.x - 1; x >= 0; x--) {
    const cell = board.screen.cell(x, box.y)
    if (isBorderChar(cell.char)) return { char: cell.char, fg: cell.fg }
  }
  return null
}

// ANSI color numbers used by silvery buffer
const ANSI_BLACK = 0
const ANSI_YELLOW = 3
const ANSI_WHITE = 7 // $text2 in dark theme
const ANSI_BRIGHT_BLACK = 8 // gray / dim

/**
 * Assert that a virtual body card has a dim gray border when unselected.
 * Body cards always have borders — dim gray when unselected, yellow when selected.
 */
function expectDimBorder(board: BoardLike, nodeId: string) {
  const cell = findBorderCell(board, nodeId)
  expect(cell, `node "${nodeId}" should have a border`).not.toBeNull()
  if (cell) {
    // Unselected body card border should be dim gray/white (bright black = 8, black = 0, or white = 7)
    expect(
      cell.fg === ANSI_BLACK || cell.fg === ANSI_WHITE || cell.fg === ANSI_BRIGHT_BLACK || cell.fg === null,
      `node "${nodeId}" border should be dim/gray, got fg=${cell.fg}`,
    ).toBe(true)
  }
}

// ─── Card Border: Structural Cards ───────────────────────────────────────────

describe("card border: structural cards (files)", () => {
  test("structural cards always have borders", () => {
    using app = createTestApp(
      item("board", item("col", item.file("1a", item("1a-child")), item.file("1b", item("1b-child")))),
      { cols: 80, rows: 24 },
    )
    expectCardBorder(app, "1a", 80)
    expectCardBorder(app, "1b", 80)
  })

  test("borders persist after cursor navigation", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.file("1a", item("1a-child")),
          item.file("1b", item("1b-child")),
          item.file("1c", item("1c-child")),
        ),
      ),
      { cols: 80, rows: 24 },
    )
    app.press("j")
    expectCardBorder(app, "1a", 80)
    expectCardBorder(app, "1b", 80)
    expectCardBorder(app, "1c", 80)
  })
})

// ─── Card Border: Virtual Body Cards ─────────────────────────────────────────

describe("card border: virtual body cards", () => {
  // FREEZE: needs testEnv — palette color comparison (ANSI_BLACK/ANSI_WHITE/ANSI_BRIGHT_BLACK indices),
  // createTestApp returns truecolor {r,g,b} objects instead of palette indices
  test("unselected body cards have dim gray border", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))), {
      columns: 80,
      rows: 24,
    })
    // 1a is selected; 1b and 1c should have dim gray border
    expectDimBorder(board, "1b")
    expectDimBorder(board, "1c")
  })

  // FREEZE: needs testEnv — palette color comparison (ANSI_YELLOW index via expectNodeBorder/expectDimBorder),
  // createTestApp returns truecolor {r,g,b} objects instead of palette indices
  test("selected body card gets yellow border", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))), {
      columns: 80,
      rows: 24,
    })
    board.press("j")
    // 1b is now selected — should have a yellow border
    board.expectNodeBorder("1b")
    // 1a and 1c should have dim gray border (unselected)
    expectDimBorder(board, "1a")
    expectDimBorder(board, "1c")
  })
})

// ─── Card Border: Scrolling ─────────────────────────────────────────────────

describe("card border: scrolling", () => {
  test("borders present after scrolling down (structural)", () => {
    const cards = Array.from({ length: 15 }, (_, i) => item.file(`card-${i}`, item(`card-${i}-child`)))
    using app = createTestApp(item("board", item("col", ...cards)), { rows: 20 })

    for (let i = 0; i < 10; i++) app.press("j")

    const box = app.screen.nodeBox("card-10")
    if (box) expectCardBorder(app, "card-10", 80)
  })

  test("borders present after scrolling back up (structural)", { timeout: 15_000 }, async () => {
    const cards = Array.from({ length: 20 }, (_, i) => item.file(`card-${i}`, item(`card-${i}-child`)))
    using app = createTestApp(item("board", item("col", ...cards)), { rows: 20 })

    for (let i = 0; i < 15; i++) app.press("j")
    for (let i = 0; i < 15; i++) app.press("k")

    expectCardBorder(app, "card-0", 80)
    expectCardBorder(app, "card-1", 80)
  })
})

// ─── Card Border: Terminal Widths ────────────────────────────────────────────

describe("card border: terminal widths", () => {
  test.each([30, 200])("single column borders intact at %d cols", (cols) => {
    using app = createTestApp(item("board", item("col1", item.file("1a", item("1a-child")))), {
      cols,
    })
    expectCardBorder(app, "1a", cols)
  })

  test("narrow terminal with two columns (80 cols)", () => {
    using app = createTestApp(
      item("board", item("col1", item.file("1a", item("1a-child"))), item("col2", item.file("2a", item("2a-child")))),
      { cols: 80 },
    )
    expectCardBorder(app, "1a", 80)
    app.press("l")
    expectCardBorder(app, "2a", 80)
  })
})

// ─── Card Border: Overflow Indicator ─────────────────────────────────────────

describe("card border: overflow indicator", () => {
  test("card with overflow still has left/right borders", () => {
    const children = Array.from({ length: 10 }, (_, i) => item(`c${i}`))
    using app = createTestApp(item("board", item("col", item.file("parent", ...children))), {
      cols: 80,
      rows: 30,
    })

    const box = app.screen.nodeBox("parent")
    expect(box, "parent node should exist").not.toBeNull()
    if (!box) return

    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    let failures = 0
    for (let y = box.y; y < box.y + box.height; y++) {
      if (borderLeft >= 0 && !isBorderChar(app.screen.cell(borderLeft, y).char)) failures++
      if (borderRight < 80 && !isBorderChar(app.screen.cell(borderRight, y).char)) failures++
    }
    expect(failures).toBe(0)
  })
})

// ─── Card Border: Multi-Column ───────────────────────────────────────────────

describe("card border: multi-column", () => {
  test("borders in all columns of 3-column layout (structural)", () => {
    const cols = 120
    using app = createTestApp(
      item(
        "board",
        item("col1", item.file("1a", item("1a-c")), item.file("1b", item("1b-c"))),
        item("col2", item.file("2a", item("2a-c")), item.file("2b", item("2b-c"))),
        item("col3", item.file("3a", item("3a-c")), item.file("3b", item("3b-c"))),
      ),
      { cols },
    )

    for (const id of ["1a", "1b", "2a", "2b", "3a", "3b"]) {
      expectCardBorder(app, id, cols)
    }
  })

  test("borders persist after navigating between columns", () => {
    const cols = 120
    using app = createTestApp(
      item(
        "board",
        item("col1", item.file("1a", item("1a-c"))),
        item("col2", item.file("2a", item("2a-c"))),
        item("col3", item.file("3a", item("3a-c"))),
      ),
      { cols },
    )

    app.press("l")
    expectCardBorder(app, "2a", cols)
    app.press("l")
    expectCardBorder(app, "3a", cols)
    app.press("h")
    app.press("h")
    expectCardBorder(app, "1a", cols)
  })
})

// ─── Card Border: Edge Cases ─────────────────────────────────────────────────

describe("card border: edge cases", () => {
  test("many columns with narrow cards", () => {
    const cols = 120
    using app = createTestApp(
      item(
        "board",
        item("col1", item.file("1a", item("1a-c"))),
        item("col2", item.file("2a", item("2a-c"))),
        item("col3", item.file("3a", item("3a-c"))),
        item("col4", item.file("4a", item("4a-c"))),
        item("col5", item.file("5a", item("5a-c"))),
      ),
      { cols },
    )
    expectCardBorder(app, "1a", cols)
    app.press("l")
    expectCardBorder(app, "2a", cols)
  })

  test("card adjacent to collapsed column", () => {
    const cols = 120
    using app = createTestApp(
      item(
        "board",
        item("col1 km.collapse:: true", item.file("1a", item("1a-c"))),
        item("col2", item.file("2a", item("2a-c")), item.file("2b", item("2b-c"))),
      ),
      { cols },
    )
    app.press("l")
    expectCardBorder(app, "2a", cols)
  })

  test("full border verification: corners and all sides (structural card)", () => {
    using app = createTestApp(item("board", item("col", item.file("task1", item("task1-c")))), {
      cols: 80,
      rows: 24,
    })

    const box = app.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    if (!box) return

    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    const borderTop = box.y - 1
    const borderBottom = box.y + box.height

    // Left and right borders on content rows
    for (let y = box.y; y < box.y + box.height; y++) {
      if (borderLeft >= 0) {
        expect(isBorderChar(app.screen.cell(borderLeft, y).char)).toBe(true)
      }
      if (borderRight < 80) {
        expect(isBorderChar(app.screen.cell(borderRight, y).char)).toBe(true)
      }
    }

    // Top corners
    if (borderTop >= 0) {
      if (borderLeft >= 0) {
        expect(isBorderChar(app.screen.cell(borderLeft, borderTop).char)).toBe(true)
      }
      if (borderRight < 80) {
        expect(isBorderChar(app.screen.cell(borderRight, borderTop).char)).toBe(true)
      }
    }

    // Bottom corners
    if (borderBottom < 24) {
      if (borderLeft >= 0) {
        expect(isBorderChar(app.screen.cell(borderLeft, borderBottom).char)).toBe(true)
      }
      if (borderRight < 80) {
        expect(isBorderChar(app.screen.cell(borderRight, borderBottom).char)).toBe(true)
      }
    }
  })
})

// ─── Layout Stability: Body Blocks ───────────────────────────────────────────

describe("layout stability invariant: body blocks", () => {
  /**
   * Helper: verify all content Y positions stay the same after navigating.
   * Every body block occupies H+2 rows (padding=1+1 or border top+bottom),
   * so cursoring never shifts content.
   */
  function assertStableYs(app: TestApp, ids: string[], initialYs: Record<string, number | null>, label: string) {
    for (const id of ids) {
      const box = app.screen.nodeBox(id)
      const y = box ? box.y : null
      if (initialYs[id] !== null && y !== null) {
        expect(y, `${id} content Y should be stable ${label}`).toBe(initialYs[id])
      }
    }
  }

  function getYs(app: TestApp, ids: string[]): Record<string, number | null> {
    const ys: Record<string, number | null> = {}
    for (const id of ids) {
      const box = app.screen.nodeBox(id)
      ys[id] = box ? box.y : null
    }
    return ys
  }

  test("content Y positions stable: pure body blocks", () => {
    const ids = ["a", "b", "c", "d"]
    using app = createTestApp(item("board", item("col", item("a"), item("b"), item("c"), item("d"))), {
      cols: 80,
      rows: 40,
    })

    const initialYs = getYs(app, ids)

    // Navigate through all body blocks and back
    for (let i = 0; i < 3; i++) {
      app.press("j")
      assertStableYs(app, ids, initialYs, `after ${i + 1}x j`)
    }
    for (let i = 0; i < 3; i++) {
      app.press("k")
      assertStableYs(app, ids, initialYs, `after ${i + 1}x k`)
    }
  })

  test("content Y positions stable: body blocks followed by structural", () => {
    // Body blocks come BEFORE structural (extractBody puts body first)
    const ids = ["a", "b", "c", "s1"]
    using app = createTestApp(
      item("board", item("col", item("a"), item("b"), item("c"), item.file("sec", item("s1")))),
      { cols: 80, rows: 40 },
    )

    const initialYs = getYs(app, ids)

    // Navigate through body blocks into structural
    app.press("j") // cursor on b
    assertStableYs(app, ids, initialYs, "cursor on b")
    app.press("j") // cursor on c
    assertStableYs(app, ids, initialYs, "cursor on c")
    app.press("j") // cursor on sec
    assertStableYs(app, ids, initialYs, "cursor on sec")
    app.press("k")
    app.press("k")
    app.press("k") // back to a
    assertStableYs(app, ids, initialYs, "back on a")
  })

  test("total column height is constant across cursor moves", () => {
    const ids = ["a", "b", "c", "d", "e"]
    using app = createTestApp(item("board", item("col", item("a"), item("b"), item("c"), item("d"), item("e"))), {
      cols: 80,
      rows: 50,
    })

    function getLastBoxBottom(): number {
      for (const id of [...ids].reverse()) {
        const box = app.screen.nodeBox(id)
        if (box) return box.y + box.height
      }
      return 0
    }

    const initialBottom = getLastBoxBottom()
    expect(initialBottom, "should have visible content").toBeGreaterThan(0)

    for (let i = 0; i < 4; i++) {
      app.press("j")
      expect(getLastBoxBottom(), `column bottom should be constant at cursor ${i + 1}`).toBe(initialBottom)
    }
    for (let i = 0; i < 4; i++) {
      app.press("k")
      expect(getLastBoxBottom(), `column bottom should be constant going back ${3 - i}`).toBe(initialBottom)
    }
  })

  test("total height stable: body blocks then structural", () => {
    // Realistic: body content (description, HR) followed by sections
    using app = createTestApp(
      item("board", item("col", item("b1"), item("b2"), item("b3"), item.file("sec", item("s1")))),
      { cols: 80, rows: 50 },
    )

    function getLastBoxBottom(): number {
      for (const id of ["s1", "b3", "b2", "b1"]) {
        const box = app.screen.nodeBox(id)
        if (box) return box.y + box.height
      }
      return 0
    }

    const initialBottom = getLastBoxBottom()
    expect(initialBottom, "should have visible content").toBeGreaterThan(0)

    for (let i = 0; i < 3; i++) {
      app.press("j")
      expect(getLastBoxBottom(), `height stable at cursor ${i + 1}`).toBe(initialBottom)
    }
    for (let i = 0; i < 3; i++) {
      app.press("k")
      expect(getLastBoxBottom(), `height stable going back ${2 - i}`).toBe(initialBottom)
    }
  })

  test("content Y positions stable: body blocks with HR", () => {
    const ids = ["a", "b", "c"]
    using app = createTestApp(
      item("board", item("col", item("a"), item.hr("hr1"), item("b"), item.hr("hr2"), item("c"))),
      { cols: 80, rows: 40 },
    )

    const initialYs = getYs(app, ids)

    // Navigate through all cards including HRs
    for (let i = 0; i < 4; i++) {
      app.press("j")
      assertStableYs(app, ids, initialYs, `after ${i + 1}x j`)
    }
    for (let i = 0; i < 4; i++) {
      app.press("k")
      assertStableYs(app, ids, initialYs, `after ${i + 1}x k`)
    }
  })

  test("content Y positions stable: body blocks with HR (pure body column)", () => {
    // Pure virtual column — all body blocks including HR
    const ids = ["a", "b"]
    using app = createTestApp(item("board", item("col", item("a"), item.hr("hr1"), item("b"))), {
      cols: 80,
      rows: 40,
    })

    const initialYs = getYs(app, ids)

    app.press("j") // cursor on hr1
    assertStableYs(app, ids, initialYs, "cursor on hr1")
    app.press("j") // cursor on b
    assertStableYs(app, ids, initialYs, "cursor on b")
    app.press("k")
    app.press("k") // back to a
    assertStableYs(app, ids, initialYs, "back on a")
  })

  test("content Y positions stable: body blocks before structural", () => {
    // extractBody: body nodes BEFORE the first oi become body cards.
    // Body nodes AFTER the first oi are treated as structural.
    // This test verifies body blocks + structural in the same column.
    const ids = ["a", "b", "s1"]
    using app = createTestApp(
      item("board", item("col", item("a"), item.hr("hr1"), item("b"), item.file("sec", item("s1")))),
      { cols: 80, rows: 40 },
    )

    const initialYs = getYs(app, ids)

    // Navigate through body blocks and into structural
    app.press("j") // cursor on hr1
    assertStableYs(app, ids, initialYs, "cursor on hr1")
    app.press("j") // cursor on b
    assertStableYs(app, ids, initialYs, "cursor on b")
    app.press("j") // cursor on sec
    assertStableYs(app, ids, initialYs, "cursor on sec")
    app.press("k")
    app.press("k")
    app.press("k") // back to a
    assertStableYs(app, ids, initialYs, "back on a")
  })
})

// ─── Card Overflow Dots ──────────────────────────────────────────────────────

describe("card-overflow-dots", () => {
  test("card with overflow shows border indicator with count", () => {
    // Create a card with a heading that has more children than maxContentLines (default 3)
    using app = createTestApp(
      item(
        "board",
        item("col1", item("heading1", item("child1"), item("child2"), item("child3"), item("child4"), item("child5"))),
      ),
      { rows: 30, cols: 80, viewMode: "cards" },
    )

    const text = app.text
    // Should show a border-based overflow indicator like "╰─── +2 more ───╯"
    expect(text).toMatch(/╰─+ \+2 more ─+╯/)
  })

  test("card without overflow does not show overflow border", () => {
    // Create a card with few enough children to not overflow
    using app = createTestApp(item("board", item("col1", item("heading1", item("child1"), item("child2")))), {
      rows: 30,
      cols: 80,
      viewMode: "cards",
    })

    const text = app.text
    // No overflow border indicator (no +N in bottom border)
    expect(text).not.toMatch(/\+\d+/)
    expect(text).not.toContain("more")
  })

  describe("multi-heading overflow (shared env)", () => {
    // FREEZE: needs testEnv — beforeAll-shared board with board.screenshot()
    let board: ReturnType<typeof testEnv>["board"]
    beforeAll(() => {
      const env = testEnv(
        () =>
          item(
            "board",
            item(
              "col1",
              item(
                "parent-card",
                item("heading-A", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
                item("heading-B", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
              ),
            ),
          ),
        { rows: 30, columns: 80, viewMode: "cards" },
      )
      board = env.board
    })

    test("multiple headings with overflow show one border indicator plus per-heading counts", () => {
      const text = board.screenshot()
      // Card border shows total hidden count, each heading shows its own +N more
      // heading-A: +2 more, heading-B: +2 more, card border: +4 more
      const overflowMatches = text.match(/\+\d+/g) ?? []
      expect(overflowMatches.length).toBeGreaterThanOrEqual(1)
      // Card border indicator should include "more"
      expect(text).toMatch(/╰─+ \+4 more ─+╯/)
    })

    test("overflow count reflects hidden children across levels", () => {
      // parent-card has 2 direct children (heading-A, heading-B) — fits in maxContentLines=3
      // Each heading has 5 children but only 3 are shown (maxContentLines=3)
      // Total hidden: 0 direct + 2 from heading-A + 2 from heading-B = 4
      const text = board.screenshot()
      expect(text).toMatch(/\+4/)
    })
  })

  test("columns view does not show overflow border", () => {
    // In columns view (oneliner variant), no border overflow indicator
    using app = createTestApp(
      item(
        "board",
        item(
          "col1",
          item(
            "heading1",
            item("child1"),
            item("child2"),
            item("child3"),
            item("child4"),
            item("child5"),
            item("child6"),
            item("child7"),
            item("child8"),
            item("child9"),
            item("child10"),
            item("child11"),
            item("child12"),
            item("child13"),
            item("child14"),
            item("child15"),
            item("child16"),
            item("child17"),
            item("child18"),
            item("child19"),
            item("child20"),
            item("child21"),
          ),
        ),
      ),
      { rows: 30, cols: 80, viewMode: "columns" },
    )

    const text = app.text
    // Columns view should NOT show overflow border pattern (that's cards-only)
    expect(text).not.toMatch(/╰─+ \+\d+ ─+╯/)
  })
})

// ─── Card Child Line Truncation ──────────────────────────────────────────────

describe("card child line truncation", () => {
  test("long child items render on exactly one line in cards view", () => {
    // Use item() with a simple ID but make the content long via the node
    // item() uses content as ID, so we need a simple ID
    using app = createTestApp(item("board", item("col1", item("card1", item("long-child")))), {
      cols: 40,
      rows: 20,
    })

    // Override the content to be very long (the ID stays "long-child")
    app.repo.updateNode("long-child", {
      content: "Accessible at /Library/Mobile Documents/comapple~CloudDocs/very-long-path-name-here",
    })

    // Re-render to pick up the content change
    app.press("j")
    app.press("k")

    // The child node should exist
    const childNode = app.q("#long-child")
    expect(childNode.count()).toBe(1)

    // The child node's root Box should be exactly 1 row tall (truncated)
    const rect = childNode.boundingBox()
    expect(rect!.height).toBe(1)
  })

  test("card root (depth 0) remains multiline while children truncate", () => {
    using app = createTestApp(item("board", item("col1", item("card1", item("child1"), item("child2")))), {
      cols: 40,
      rows: 20,
    })

    // Override content to be very long
    app.repo.updateNode("child1", {
      content: "First child with a very long description that should be truncated at column boundary",
    })
    app.repo.updateNode("child2", {
      content: "Second child also with extremely long text that exceeds the available width easily",
    })

    // Re-render
    app.press("j")
    app.press("k")

    // Both children should exist
    app.expect("#child1").toExist()
    app.expect("#child2").toExist()

    // Each child should be exactly 1 row tall (truncated, not wrapped)
    const child1Rect = app.q("#child1").boundingBox()!
    const child2Rect = app.q("#child2").boundingBox()!
    expect(child1Rect.height).toBe(1)
    expect(child2Rect.height).toBe(1)

    // Children should be on consecutive lines (not taking multiple lines each)
    expect(child2Rect.y).toBe(child1Rect.y + 1)
  })
})

// ─── Card Border: Date Badge Overflow ─────────────────────────────────────────

describe("card border: date badge overflow", () => {
  test("right border intact when card has date badge", () => {
    // Create a task with a due date that produces a date badge (e.g., "Sep 30")
    const taskNodes = item.task("After Delei gets ring - change to d@delei.org")
    if (taskNodes[0]) {
      taskNodes[0].due_at = "2026-09-30T00:00:00Z"
    }

    using app = createTestApp(item("board", item("col", taskNodes)), { cols: 40, rows: 12 })

    // Find the task's box
    const taskId = taskNodes[0]!.id
    const box = app.screen.nodeBox(taskId)
    expect(box, "task should be visible").not.toBeNull()
    if (!box) return

    // Check border on the right side (1 cell past the content area)
    const borderRight = box.x + box.width
    if (borderRight < 40) {
      for (let y = box.y; y < box.y + box.height; y++) {
        const rightCell = app.screen.cell(borderRight, y)
        expect(
          isBorderChar(rightCell.char),
          `Right border at (${borderRight},${y}): got '${rightCell.char}' (content area ends at x=${box.x + box.width - 1})`,
        ).toBe(true)
      }
    }
  })

  test.each([30, 35, 40, 45, 50, 60, 80])(
    "right border intact with long title and date badge at %d cols",
    (termWidth) => {
      const taskNodes = item.task("After Delei gets ring - change to d@delei.org")
      if (taskNodes[0]) {
        taskNodes[0].due_at = "2026-09-30T00:00:00Z"
      }

      using app = createTestApp(item("board", item("col", taskNodes)), { cols: termWidth, rows: 12 })

      const taskId = taskNodes[0]!.id
      const box = app.screen.nodeBox(taskId)
      if (!box) return

      const borderRight = box.x + box.width
      if (borderRight < termWidth) {
        for (let y = box.y; y < box.y + box.height; y++) {
          const rightCell = app.screen.cell(borderRight, y)
          expect(
            isBorderChar(rightCell.char),
            `termWidth=${termWidth} Right border at (${borderRight},${y}): got '${rightCell.char}'`,
          ).toBe(true)
        }
      }
    },
  )
})

// ─── Card Overflow: Title Wrap Lines ──────────────────────────────────────────

describe("card overflow: title wrap lines", () => {
  test("overflow count includes extra lines from a wrapping title", () => {
    // Title longer than card inner width (~76 chars for 80-col terminal) wraps to 2 lines.
    // With maxContentLines=3 and 5 children: hidden = (5-3) + (2-1 title lines) = 3
    const longTitle =
      "This is a very long card title that should definitely wrap to two lines in the card view because it exceeds width"
    using app = createTestApp(
      item(
        "board",
        item("col1", item(longTitle, item("child1"), item("child2"), item("child3"), item("child4"), item("child5"))),
      ),
      { rows: 30, cols: 80, viewMode: "cards" },
    )

    const text = app.text
    // Should show +3 (2 hidden children + 1 extra title wrap line), not +2
    expect(text).toMatch(/\+3/)
  })
})

// ─── Card Body: List Markers (Not Italics) ──────────────────────────────────

/**
 * Regression: card body with `* item` content should NOT render as italics.
 *
 * When a paragraph node contains content with `* text` list markers,
 * the asterisks should be rendered as-is (list markers), not as markdown
 * italic formatting.
 */
describe("card body list markers (not italics)", () => {
  test("* at line start is not rendered as italic", () => {
    // Create a card with a paragraph body that has list-like content
    using app = createTestApp(
      item(
        "board",
        item("col1", item("task-with-notes", item.p("* first item\n* second item"))),
        item("col2", item("card2")),
      ),
      { cols: 80, rows: 24, checkIncremental: false, incremental: false },
    )

    const screen = app.text
    // The * should be preserved as a list marker, not consumed by italic formatting
    // (Only first line visible due to card height constraint)
    expect(screen).toContain("* first item")
  })
})

// ─── Column Header Last Char ────────────────────────────────────────────────

/**
 * Column headers show full name — last character must not be truncated.
 *
 * Regression test for km-tui.col-header-trunc and km-tui.col-trunc2:
 * headers like "FAMILY SCHEDULE" / "FAMILY SPRINT" were rendered as
 * "FAMILY SCHEDUL" / "FAMILY SPRIN" (missing last char).
 *
 * NOTE: The original root cause was a mismatch between terminal rendering
 * (Ghostty renders PUA nerdfont icons as 2-cell) and string-width (reports 1).
 * A blanket PUA=2 fix was attempted but reverted because it broke ALL borders
 * and alignment (most terminals render PUA nerdfont icons as 1-cell).
 *
 * The test fixtures here don't contain PUA icons (testEnv doesn't inject them),
 * so these tests verify that column layout itself doesn't truncate names.
 * The terminal-specific mismatch is tracked separately in km-tui.col-trunc2.
 *
 * Bead: km-tui.col-header-trunc, km-tui.col-trunc2
 */
describe("col-header-last-char", () => {
  test("nerdfont PUA icons measured as 1-wide by string-width", () => {
    // PUA nerdfont icons (U+E000-U+F8FF) are measured as 1-cell by string-width.
    // Some terminals (Ghostty, Kitty) render them as 2-cell, but the measurement
    // library treats them as 1-cell. We match string-width's measurement.
    const folderIcon = "\uF114"
    const fileIcon = "\uF0F6"
    const sectionIcon = "\u00A7" // § - not PUA, always 1

    expect(graphemeWidth(folderIcon), "PUA folder icon is 1-wide per string-width").toBe(1)
    expect(graphemeWidth(fileIcon), "PUA file icon is 1-wide per string-width").toBe(1)
    expect(graphemeWidth(sectionIcon), "section sign should be 1-wide").toBe(1)
  })

  test("displayWidth with PUA icon in header text", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name (icon is 1-wide per string-width)
    const headerText = `${folderIcon} FAMILY SCHEDULE`

    // 1 (icon) + 1 (space) + 15 (name) = 17
    expect(displayWidth(headerText)).toBe(17)
  })

  test("single column header shows full name", () => {
    using app = createTestApp(item.root("board", item("FAMILY SCHEDULE", item("task-a"))), {
      cols: 80,
      rows: 20,
    })

    const text = app.text
    expect(text).toContain("FAMILY SCHEDULE")
  })

  test("two-column board shows full column names", () => {
    using app = createTestApp(
      item.root("board", item("FAMILY SCHEDULE", item("task-a")), item("PORTFOLIO", item("task-b"))),
      { cols: 80, rows: 20 },
    )

    const text = app.text
    expect(text).toContain("FAMILY SCHEDULE")
    expect(text).toContain("PORTFOLIO")
  })

  test.each(["SPRINT", "BACKLOG", "SCHEDULE", "PORTFOLIO", "PRODUCTIVITY"])(
    "column header last char not eaten by off-by-one: %s",
    (name) => {
      using app = createTestApp(item.root("board", item(name, item("task"))), { cols: 80, rows: 15 })
      const text = app.text
      expect(text, `Column "${name}" should be fully visible`).toContain(name)
    },
  )

  test("PUA nerdfont icons measured as 1-wide (km-tui.col-trunc2)", () => {
    // Nerdfont icons in the Private Use Area (U+E000-U+F8FF) are measured as
    // 1-cell by string-width. Some terminals render them as 2-cell, creating
    // a mismatch. We match string-width's measurement for consistent layout.
    const folderIcon = "\uF114" //  folder-o (nerdfont)
    const fileIcon = "\uF0F6" //  file-text-o (nerdfont)

    expect(graphemeWidth(folderIcon), "PUA folder icon is 1-wide per string-width").toBe(1)
    expect(graphemeWidth(fileIcon), "PUA file icon is 1-wide per string-width").toBe(1)
  })

  test("displayWidth with PUA nerdfont icon (km-tui.col-trunc2)", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name (icon is 1-wide per string-width)
    const headerText = `${folderIcon} FAMILY SPRINT`

    // 1 (icon) + 1 (space) + 13 (name) = 15
    expect(displayWidth(headerText)).toBe(15)
  })

  test("column header with PUA icon shows full name — no last-char truncation (km-tui.col-trunc2)", () => {
    // Regression: "FAMILY SPRINT" column showed "FAMILY SPRIN" in Ghostty because
    // the PUA folder icon took 2 cells but was measured as 1. The layout engine
    // allocated 1 extra cell to the name, causing the last char to be clipped
    // at the column boundary.
    using app = createTestApp(item.root("board", item("FAMILY SPRINT", item("task-a")), item("col2", item("task-b"))), {
      cols: 80,
      rows: 20,
    })

    const text = app.text
    expect(text, "FAMILY SPRINT should not be truncated").toContain("FAMILY SPRINT")
  })

  test("emoji in column name does not truncate last char (km-tui.col-trunc2)", () => {
    // The calendar emoji is 2 cells wide + PUA folder icon is 2 cells.
    // Total icon area: 2 (PUA icon) + 1 (space) + display name.
    // The name "FAMILY SPRINT" = 2 (emoji) + 1 (space) + 13 (name) = 16.
    // Total header: 2 + 1 + 16 = 19 cells. Must fit in column width.
    using app = createTestApp(
      item.root("board", item("\u{1F4C5} FAMILY SPRINT", item("task-a")), item("col2", item("task-b"))),
      { cols: 80, rows: 20 },
    )

    const text = app.text
    expect(text, "FAMILY SPRINT should not be truncated").toContain("FAMILY SPRINT")
  })
})

// ─── Col Header Dup: Column Header Style Transition ─────────────────────────

/**
 * Regression test: km-tui.col-header-dup
 * Column header rendered twice when cursor moves to column level.
 *
 * The column header Box has backgroundColor that transitions:
 * - Card level: undefined (no bg, yellow text)
 * - Column level: km.selectionBg (yellow bg, black text)
 *
 * Tests that incremental rendering correctly handles the
 * backgroundColor transition and doesn't leave stale cells.
 *
 * Root cause: changesToAnsi used CUF (Cursor Forward) to skip unchanged
 * cells on a row, but didn't reset SGR bg first. Some terminals (Ghostty)
 * fill skipped cells with the current bg, causing visual artifacts.
 * Fix: reset SGR before CUF when bg is set (output-phase.ts).
 *
 * These tests use createBoardDriver directly with withDiagnostics — kept as-is.
 */

// vt100 output verification is auto-enabled via SILVERY_STRICT=1 (vitest/setup.ts)
describe("col-header-dup: column header style transition", () => {
  test("incremental render matches fresh during card/column navigation", async () => {
    const nodes = item.root(
      "board",
      item("beowa", item("task-a"), item("task-b"), item("task-c")),
      item("bjorn", item("task-d"), item("task-e")),
      item("early-orbit", item("task-f")),
    )
    const repo = createFakeRepo({ nodes })

    const baseDriver = createBoardDriver(repo, "board", {
      columns: 80,
      rows: 24,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
    })

    // Start at first card
    expect(driver.getState().cursor.level).toBe("card")

    // Navigate up — may go to column or board depending on position
    await driver.cmd.up!()

    // If at column level, great — we've triggered bg transition
    // If at board level, go down to column
    const level1 = driver.getState().cursor.level
    if (level1 === "board") {
      await driver.cmd.down!()
    }

    // Navigate through all levels
    await driver.cmd.down!() // card
    await driver.cmd.down!() // next card
    await driver.cmd.right!() // next column
    await driver.cmd.up!() // toward column header
    await driver.cmd.down!() // back to card
    await driver.cmd.left!() // back to first column

    // All diagnostics passed — incremental rendering matches fresh render
  })

  test("column header row has no duplicate content", async () => {
    const nodes = item.root(
      "board",
      item("alpha-col", item("task-a"), item("task-b")),
      item("beta-col", item("task-d")),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 80,
      rows: 24,
    })

    const text = stripAnsi(driver.text)
    const lines = text.split("\n")

    // Find the column header line (contains column names but not breadcrumb)
    // Breadcrumb line contains ">" path separator
    const headerLine = lines.find((line) => line.includes("alpha-col") && !line.includes(">"))
    expect(headerLine, "should find column header line").toBeDefined()

    // "alpha-col" should appear exactly once on the header line
    const matches = (headerLine!.match(/alpha-col/g) || []).length
    expect(matches, `"alpha-col" on header line: ${headerLine}`).toBe(1)

    // Navigate to column level (k until column)
    await driver.press("k")
    let level = driver.getState().cursor.level
    if (level !== "column") {
      await driver.press("k")
      level = driver.getState().cursor.level
    }

    const textAfter = stripAnsi(driver.text)
    const linesAfter = textAfter.split("\n")

    // After navigation, "alpha-col" should still appear exactly once per
    // non-breadcrumb line
    for (const line of linesAfter) {
      if (line.includes(">")) continue // skip breadcrumb
      const count = (line.match(/alpha-col/g) || []).length
      expect(count, `"alpha-col" count on line "${line.trimEnd()}"`).toBeLessThanOrEqual(1)
    }
  })

  test("card↔column transitions with incremental check (testEnv)", () => {
    // testEnv enables checkIncremental by default, which compares
    // incremental buffer against fresh render after every press()
    using app = createTestApp(
      item.root(
        "board",
        item("alpha-col", item("task-a"), item("task-b"), item("task-c")),
        item("beta-col", item("task-d"), item("task-e")),
      ),
    )

    // card → column (bg transition: undefined → yellow)
    app.press("k")

    // column → card (bg transition: yellow → undefined)
    app.press("j")

    // card → card (no bg transition)
    app.press("j")

    // card → next column via right
    app.press("l")

    // column header of beta-col
    app.press("k")

    // back to card
    app.press("j")

    // back to alpha-col
    app.press("h")

    // All incremental checks passed — no buffer mismatches
    const text = stripAnsi(app.text)
    const lines = text.split("\n")
    for (const line of lines) {
      if (line.includes(">")) continue
      const alphaCount = (line.match(/alpha-col/g) || []).length
      expect(alphaCount, `"alpha-col" dup on "${line.trimEnd()}"`).toBeLessThanOrEqual(1)
      const betaCount = (line.match(/beta-col/g) || []).length
      expect(betaCount, `"beta-col" dup on "${line.trimEnd()}"`).toBeLessThanOrEqual(1)
    }
  })
})

// =============================================================================
// Emoji rendering garble regression (from emoji-garble.slow.test.ts)
//
// Root cause: replayAnsiWithStyles in output-phase.ts had a ZWJ combining bug.
// Characters after ZWJ (U+200D) — like male sign (U+2642) in runner emoji — were
// not consumed as part of the grapheme cluster, splitting the emoji across multiple
// columns and causing progressive cursor drift in the virtual terminal replay.
//
// These tests verify that SILVERY_STRICT catches no mismatches when rendering emoji.
// =============================================================================

describe("emoji content garble reproduction", () => {
  beforeEach(() => {
    process.env.SILVERY_STRICT = "1"
  })
  afterEach(() => {
    delete process.env.SILVERY_STRICT
  })

  test("cards with flag emoji + navigation", () => {
    const nodes = item(
      "board",
      item(
        "\u{1F1E8}\u{1F1E6} Canada Tasks",
        item("\u{1F3E0} Fix roof"),
        item("\u{1F468}\u{1F3FB}\u200D\u{1F4BB} Code review"),
        item("\u{1F538} Priority item"),
        item("\u{1F4F1} Mobile app"),
      ),
      item(
        "\u{1F1FA}\u{1F1F8} US Tasks",
        item("\u{1F4BC} Business meeting"),
        item("\u{1F4CA} Q4 Report"),
        item("\u{1F3AF} Sprint goal"),
      ),
      item("Regular Column", item("Plain task A"), item("Plain task B")),
    )
    using app = createTestApp(nodes, { cols: 120, rows: 30 })

    // Navigate through emoji columns
    for (const key of ["l", "l", "j", "j", "h", "j", "k", "l", "h", "h"]) {
      app.press(key)
    }
  })

  test("mixed emoji and ASCII — navigation doesn't garble", () => {
    const nodes = item(
      "board",
      item(
        "#routine",
        item("07:30 Morning routine \u{1F3C3}\u200D\u2642\uFE0F"),
        item("08:00 Breakfast \u2615"),
        item("09:00 Work start \u{1F4BB}"),
        item("12:00 Lunch \u{1F37D}\uFE0F"),
        item("17:00 Exercise \u{1F3CB}\uFE0F\u200D\u2642\uFE0F"),
      ),
      item("Harmon from Modo called", item("Follow up on proposal"), item("Send contract \u{1F4C4}")),
      item("Calendar", item("10:00 Standup"), item("14:00 1:1 with @bj\u00F8rn-st"), item("15:30 Demo prep")),
    )
    using app = createTestApp(nodes, { cols: 100, rows: 25 })

    // Navigate — SILVERY_STRICT checks buffer + output on each press
    for (const key of ["l", "l", "j", "j", "j", "h", "h", "k", "k", "l", "j"]) {
      app.press(key)
    }
  })

  test("wide chars with extensive navigation", () => {
    const nodes = item(
      "board",
      item(
        "Tasks",
        item("Buy groceries \u{1F6D2}"),
        item("Call dentist \u260E\uFE0F"),
        item("Book flights \u2708\uFE0F"),
        item("Return package \u{1F4E6}"),
        item("Fix bike \u{1F527}"),
        item("Water plants \u{1F331}"),
      ),
      item(
        "Goals",
        item("Learn Japanese \u{1F1EF}\u{1F1F5}"),
        item("Run marathon \u{1F3C3}"),
        item("Read 50 books \u{1F4DA}"),
      ),
    )
    using app = createTestApp(nodes, { cols: 80, rows: 20 })

    // Navigate extensively — SILVERY_STRICT catches any mismatch
    const sequence = ["j", "j", "j", "l", "j", "j", "h", "k", "k", "l", "l", "j", "j", "j", "k", "h", "j", "j"]
    for (const key of sequence) {
      app.press(key)
    }
  })
})

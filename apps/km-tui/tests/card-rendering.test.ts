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
 * NOTE: board.screen.nodeBox("id") returns the TreeNode content area
 * INSIDE the Card's border. The Card border is 1 cell outside:
 * - Left border: box.x - 1
 * - Right border: box.x + box.width
 */

import { describe, test, expect, beforeAll } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// ─── Card Border Helpers ─────────────────────────────────────────────────────

/** Check if a character is a box-drawing border character. */
function isBorderChar(c: string): boolean {
  return "│┌┐└┘├┤┬┴╭╮╯╰─".includes(c)
}

/**
 * Assert that the Card border has proper border chars at correct positions.
 * Checks 1 cell outside the nodeBox (where the Card's Box border renders).
 */
function expectCardBorder(board: ReturnType<typeof testEnv>["board"], nodeId: string, termWidth: number) {
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
function findBorderCell(
  board: ReturnType<typeof testEnv>["board"],
  nodeId: string,
): { char: string; fg: string | null } | null {
  const box = board.screen.nodeBox(nodeId)
  if (!box) return null
  for (let x = box.x - 1; x >= 0; x--) {
    const cell = board.screen.cell(x, box.y)
    if (isBorderChar(cell.char)) return { char: cell.char, fg: cell.fg }
  }
  return null
}

// ANSI color numbers used by inkx buffer
const ANSI_BLACK = 0
const ANSI_YELLOW = 3
const ANSI_BRIGHT_BLACK = 8 // gray / dim

/**
 * Assert that a virtual body card has a dim gray border when unselected.
 * Body cards always have borders — dim gray when unselected, yellow when selected.
 */
function expectDimBorder(board: ReturnType<typeof testEnv>["board"], nodeId: string) {
  const cell = findBorderCell(board, nodeId)
  expect(cell, `node "${nodeId}" should have a border`).not.toBeNull()
  if (cell) {
    // Unselected body card border should be dim gray (bright black = 8, or black = 0)
    expect(
      cell.fg === ANSI_BLACK || cell.fg === ANSI_BRIGHT_BLACK || cell.fg === null,
      `node "${nodeId}" border should be dim/gray, got fg=${cell.fg}`,
    ).toBe(true)
  }
}

// ─── Card Border: Structural Cards ───────────────────────────────────────────

describe("card border: structural cards (sections)", () => {
  test("structural cards always have borders", () => {
    const { board } = testEnv(
      () => item("board", item("col", item.section("1a", item("1a-child")), item.section("1b", item("1b-child")))),
      { columns: 80, rows: 24 },
    )
    expectCardBorder(board, "1a", 80)
    expectCardBorder(board, "1b", 80)
  })

  test("borders persist after cursor navigation", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item.section("1a", item("1a-child")),
            item.section("1b", item("1b-child")),
            item.section("1c", item("1c-child")),
          ),
        ),
      { columns: 80, rows: 24 },
    )
    board.press("j")
    expectCardBorder(board, "1a", 80)
    expectCardBorder(board, "1b", 80)
    expectCardBorder(board, "1c", 80)
  })
})

// ─── Card Border: Virtual Body Cards ─────────────────────────────────────────

describe("card border: virtual body cards", () => {
  test("unselected body cards have dim gray border", () => {
    const { board } = testEnv(() => item("board", item("col", item("1a"), item("1b"), item("1c"))), {
      columns: 80,
      rows: 24,
    })
    // 1a is selected; 1b and 1c should have dim gray border
    expectDimBorder(board, "1b")
    expectDimBorder(board, "1c")
  })

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
    const cards = Array.from({ length: 15 }, (_, i) => item.section(`card-${i}`, item(`card-${i}-child`)))
    const { board } = testEnv(() => item("board", item("col", ...cards)), { rows: 20 })

    for (let i = 0; i < 10; i++) board.press("j")

    const box = board.screen.nodeBox("card-10")
    if (box) expectCardBorder(board, "card-10", 80)
  })

  test("borders present after scrolling back up (structural)", () => {
    const cards = Array.from({ length: 20 }, (_, i) => item.section(`card-${i}`, item(`card-${i}-child`)))
    const { board } = testEnv(() => item("board", item("col", ...cards)), { rows: 20 })

    for (let i = 0; i < 15; i++) board.press("j")
    for (let i = 0; i < 15; i++) board.press("k")

    expectCardBorder(board, "card-0", 80)
    expectCardBorder(board, "card-1", 80)
  })
})

// ─── Card Border: Terminal Widths ────────────────────────────────────────────

describe("card border: terminal widths", () => {
  test.each([30, 200])("single column borders intact at %d cols", (cols) => {
    const { board } = testEnv(() => item("board", item("col1", item.section("1a", item("1a-child")))), {
      columns: cols,
    })
    expectCardBorder(board, "1a", cols)
  })

  test("narrow terminal with two columns (80 cols)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("1a", item("1a-child"))),
          item("col2", item.section("2a", item("2a-child"))),
        ),
      { columns: 80 },
    )
    expectCardBorder(board, "1a", 80)
    board.press("l")
    expectCardBorder(board, "2a", 80)
  })
})

// ─── Card Border: Overflow Indicator ─────────────────────────────────────────

describe("card border: overflow indicator", () => {
  test("card with overflow still has left/right borders", () => {
    const children = Array.from({ length: 10 }, (_, i) => item(`c${i}`))
    const { board } = testEnv(() => item("board", item("col", item.section("parent", ...children))), {
      columns: 80,
      rows: 30,
    })

    const box = board.screen.nodeBox("parent")
    expect(box, "parent node should exist").not.toBeNull()
    if (!box) return

    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    let failures = 0
    for (let y = box.y; y < box.y + box.height; y++) {
      if (borderLeft >= 0 && !isBorderChar(board.screen.cell(borderLeft, y).char)) failures++
      if (borderRight < 80 && !isBorderChar(board.screen.cell(borderRight, y).char)) failures++
    }
    expect(failures).toBe(0)
  })
})

// ─── Card Border: Multi-Column ───────────────────────────────────────────────

describe("card border: multi-column", () => {
  test("borders in all columns of 3-column layout (structural)", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("1a", item("1a-c")), item.section("1b", item("1b-c"))),
          item("col2", item.section("2a", item("2a-c")), item.section("2b", item("2b-c"))),
          item("col3", item.section("3a", item("3a-c")), item.section("3b", item("3b-c"))),
        ),
      { columns: cols },
    )

    for (const id of ["1a", "1b", "2a", "2b", "3a", "3b"]) {
      expectCardBorder(board, id, cols)
    }
  })

  test("borders persist after navigating between columns", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("1a", item("1a-c"))),
          item("col2", item.section("2a", item("2a-c"))),
          item("col3", item.section("3a", item("3a-c"))),
        ),
      { columns: cols },
    )

    board.press("l")
    expectCardBorder(board, "2a", cols)
    board.press("l")
    expectCardBorder(board, "3a", cols)
    board.press("h").press("h")
    expectCardBorder(board, "1a", cols)
  })
})

// ─── Card Border: Edge Cases ─────────────────────────────────────────────────

describe("card border: edge cases", () => {
  test("many columns with narrow cards", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.section("1a", item("1a-c"))),
          item("col2", item.section("2a", item("2a-c"))),
          item("col3", item.section("3a", item("3a-c"))),
          item("col4", item.section("4a", item("4a-c"))),
          item("col5", item.section("5a", item("5a-c"))),
        ),
      { columns: cols },
    )
    expectCardBorder(board, "1a", cols)
    board.press("l")
    expectCardBorder(board, "2a", cols)
  })

  test("card adjacent to collapsed column", () => {
    const cols = 120
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1 km.collapse:: true", item.section("1a", item("1a-c"))),
          item("col2", item.section("2a", item("2a-c")), item.section("2b", item("2b-c"))),
        ),
      { columns: cols },
    )
    board.press("l")
    expectCardBorder(board, "2a", cols)
  })

  test("full border verification: corners and all sides (structural card)", () => {
    const { board } = testEnv(() => item("board", item("col", item.section("task1", item("task1-c")))), {
      columns: 80,
      rows: 24,
    })

    const box = board.screen.nodeBox("task1")
    expect(box).not.toBeNull()
    if (!box) return

    const borderLeft = box.x - 1
    const borderRight = box.x + box.width
    const borderTop = box.y - 1
    const borderBottom = box.y + box.height

    // Left and right borders on content rows
    for (let y = box.y; y < box.y + box.height; y++) {
      if (borderLeft >= 0) {
        expect(isBorderChar(board.screen.cell(borderLeft, y).char)).toBe(true)
      }
      if (borderRight < 80) {
        expect(isBorderChar(board.screen.cell(borderRight, y).char)).toBe(true)
      }
    }

    // Top corners
    if (borderTop >= 0) {
      if (borderLeft >= 0) {
        expect(isBorderChar(board.screen.cell(borderLeft, borderTop).char)).toBe(true)
      }
      if (borderRight < 80) {
        expect(isBorderChar(board.screen.cell(borderRight, borderTop).char)).toBe(true)
      }
    }

    // Bottom corners
    if (borderBottom < 24) {
      if (borderLeft >= 0) {
        expect(isBorderChar(board.screen.cell(borderLeft, borderBottom).char)).toBe(true)
      }
      if (borderRight < 80) {
        expect(isBorderChar(board.screen.cell(borderRight, borderBottom).char)).toBe(true)
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
  function assertStableYs(
    board: ReturnType<typeof testEnv>["board"],
    ids: string[],
    initialYs: Record<string, number | null>,
    label: string,
  ) {
    for (const id of ids) {
      const box = board.screen.nodeBox(id)
      const y = box ? box.y : null
      if (initialYs[id] !== null && y !== null) {
        expect(y, `${id} content Y should be stable ${label}`).toBe(initialYs[id])
      }
    }
  }

  function getYs(board: ReturnType<typeof testEnv>["board"], ids: string[]): Record<string, number | null> {
    const ys: Record<string, number | null> = {}
    for (const id of ids) {
      const box = board.screen.nodeBox(id)
      ys[id] = box ? box.y : null
    }
    return ys
  }

  test("content Y positions stable: pure body blocks", () => {
    const ids = ["a", "b", "c", "d"]
    const { board } = testEnv(() => item("board", item("col", item("a"), item("b"), item("c"), item("d"))), {
      columns: 80,
      rows: 40,
    })

    const initialYs = getYs(board, ids)

    // Navigate through all body blocks and back
    for (let i = 0; i < 3; i++) {
      board.press("j")
      assertStableYs(board, ids, initialYs, `after ${i + 1}x j`)
    }
    for (let i = 0; i < 3; i++) {
      board.press("k")
      assertStableYs(board, ids, initialYs, `after ${i + 1}x k`)
    }
  })

  test("content Y positions stable: body blocks followed by structural", () => {
    // Body blocks come BEFORE structural (extractBody puts body first)
    const ids = ["a", "b", "c", "s1"]
    const { board } = testEnv(
      () => item("board", item("col", item("a"), item("b"), item("c"), item.section("sec", item("s1")))),
      { columns: 80, rows: 40 },
    )

    const initialYs = getYs(board, ids)

    // Navigate through body blocks into structural
    board.press("j") // cursor on b
    assertStableYs(board, ids, initialYs, "cursor on b")
    board.press("j") // cursor on c
    assertStableYs(board, ids, initialYs, "cursor on c")
    board.press("j") // cursor on sec
    assertStableYs(board, ids, initialYs, "cursor on sec")
    board.press("k").press("k").press("k") // back to a
    assertStableYs(board, ids, initialYs, "back on a")
  })

  test("total column height is constant across cursor moves", () => {
    const ids = ["a", "b", "c", "d", "e"]
    const { board } = testEnv(() => item("board", item("col", item("a"), item("b"), item("c"), item("d"), item("e"))), {
      columns: 80,
      rows: 50,
    })

    function getLastBoxBottom(): number {
      for (const id of [...ids].reverse()) {
        const box = board.screen.nodeBox(id)
        if (box) return box.y + box.height
      }
      return 0
    }

    const initialBottom = getLastBoxBottom()
    expect(initialBottom, "should have visible content").toBeGreaterThan(0)

    for (let i = 0; i < 4; i++) {
      board.press("j")
      expect(getLastBoxBottom(), `column bottom should be constant at cursor ${i + 1}`).toBe(initialBottom)
    }
    for (let i = 0; i < 4; i++) {
      board.press("k")
      expect(getLastBoxBottom(), `column bottom should be constant going back ${3 - i}`).toBe(initialBottom)
    }
  })

  test("total height stable: body blocks then structural", () => {
    // Realistic: body content (description, HR) followed by sections
    const { board } = testEnv(
      () => item("board", item("col", item("b1"), item("b2"), item("b3"), item.section("sec", item("s1")))),
      { columns: 80, rows: 50 },
    )

    function getLastBoxBottom(): number {
      for (const id of ["s1", "b3", "b2", "b1"]) {
        const box = board.screen.nodeBox(id)
        if (box) return box.y + box.height
      }
      return 0
    }

    const initialBottom = getLastBoxBottom()
    expect(initialBottom, "should have visible content").toBeGreaterThan(0)

    for (let i = 0; i < 3; i++) {
      board.press("j")
      expect(getLastBoxBottom(), `height stable at cursor ${i + 1}`).toBe(initialBottom)
    }
    for (let i = 0; i < 3; i++) {
      board.press("k")
      expect(getLastBoxBottom(), `height stable going back ${2 - i}`).toBe(initialBottom)
    }
  })

  test("content Y positions stable: body blocks with HR", () => {
    const ids = ["a", "b", "c"]
    const { board } = testEnv(
      () => item("board", item("col", item("a"), item.hr("hr1"), item("b"), item.hr("hr2"), item("c"))),
      { columns: 80, rows: 40 },
    )

    const initialYs = getYs(board, ids)

    // Navigate through all cards including HRs
    for (let i = 0; i < 4; i++) {
      board.press("j")
      assertStableYs(board, ids, initialYs, `after ${i + 1}x j`)
    }
    for (let i = 0; i < 4; i++) {
      board.press("k")
      assertStableYs(board, ids, initialYs, `after ${i + 1}x k`)
    }
  })

  test("content Y positions stable: body blocks with HR (pure body column)", () => {
    // Pure virtual column — all body blocks including HR
    const ids = ["a", "b"]
    const { board } = testEnv(() => item("board", item("col", item("a"), item.hr("hr1"), item("b"))), {
      columns: 80,
      rows: 40,
    })

    const initialYs = getYs(board, ids)

    board.press("j") // cursor on hr1
    assertStableYs(board, ids, initialYs, "cursor on hr1")
    board.press("j") // cursor on b
    assertStableYs(board, ids, initialYs, "cursor on b")
    board.press("k").press("k") // back to a
    assertStableYs(board, ids, initialYs, "back on a")
  })

  test("content Y positions stable: body blocks before structural", () => {
    // extractBody: body nodes BEFORE the first oi become body cards.
    // Body nodes AFTER the first oi are treated as structural.
    // This test verifies body blocks + structural in the same column.
    const ids = ["a", "b", "s1"]
    const { board } = testEnv(
      () => item("board", item("col", item("a"), item.hr("hr1"), item("b"), item.section("sec", item("s1")))),
      { columns: 80, rows: 40 },
    )

    const initialYs = getYs(board, ids)

    // Navigate through body blocks and into structural
    board.press("j") // cursor on hr1
    assertStableYs(board, ids, initialYs, "cursor on hr1")
    board.press("j") // cursor on b
    assertStableYs(board, ids, initialYs, "cursor on b")
    board.press("j") // cursor on sec
    assertStableYs(board, ids, initialYs, "cursor on sec")
    board.press("k").press("k").press("k") // back to a
    assertStableYs(board, ids, initialYs, "back on a")
  })
})

// ─── Card Overflow Dots ──────────────────────────────────────────────────────

describe("card-overflow-dots", () => {
  test("card with overflow shows border indicator with count", () => {
    // Create a card with a heading that has more children than maxContentLines (default 3)
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("heading1", item("child1"), item("child2"), item("child3"), item("child4"), item("child5")),
          ),
        ),
      { rows: 30, columns: 80, viewMode: "cards" },
    )

    const text = board.screenshot()
    // Should show a border-based overflow indicator like "╰─── +2 ───╯"
    expect(text).toMatch(/╰─+ \+2 ─+╯/)
    // Should NOT show "+N more" (suppressed in cards mode)
    expect(text).not.toContain("more")
  })

  test("card without overflow does not show overflow border", () => {
    // Create a card with few enough children to not overflow
    const { board } = testEnv(() => item("board", item("col1", item("heading1", item("child1"), item("child2")))), {
      rows: 30,
      columns: 80,
      viewMode: "cards",
    })

    const text = board.screenshot()
    // No overflow border indicator (no +N in bottom border)
    expect(text).not.toMatch(/\+\d+/)
    expect(text).not.toContain("more")
  })

  describe("multi-heading overflow (shared env)", () => {
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

    test("multiple headings with overflow show only one border indicator", () => {
      const text = board.screenshot()
      // Should show a single overflow border line (one per card, not per heading)
      const overflowBorders = text.match(/\+\d+/g) ?? []
      expect(overflowBorders).toHaveLength(1)
      expect(text).not.toContain("more")
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
    const { board } = testEnv(
      () =>
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
      { rows: 30, columns: 80, viewMode: "columns" },
    )

    const text = board.screenshot()
    // Columns view should NOT show overflow border pattern (that's cards-only)
    expect(text).not.toMatch(/╰─+ \+\d+ ─+╯/)
  })
})

// ─── Card Child Line Truncation ──────────────────────────────────────────────

describe("card child line truncation", () => {
  test("long child items render on exactly one line in cards view", () => {
    // Use item() with a simple ID but make the content long via the node
    // item() uses content as ID, so we need a simple ID
    const { board, repo } = testEnv(() => item("board", item("col1", item("card1", item("long-child")))), {
      columns: 40,
      rows: 20,
    })

    // Override the content to be very long (the ID stays "long-child")
    repo.updateNode("long-child", {
      content: "Accessible at /Library/Mobile Documents/comapple~CloudDocs/very-long-path-name-here",
    })

    // Re-render to pick up the content change
    board.press("j").press("k")

    // The child node should exist
    const childNode = board.q("#long-child")
    expect(childNode.count()).toBe(1)

    // The child node's root Box should be exactly 1 row tall (truncated)
    const rect = childNode.boundingBox()
    expect(rect.height).toBe(1)
  })

  test("card root (depth 0) remains multiline while children truncate", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("card1", item("child1"), item("child2")))), {
      columns: 40,
      rows: 20,
    })

    // Override content to be very long
    repo.updateNode("child1", {
      content: "First child with a very long description that should be truncated at column boundary",
    })
    repo.updateNode("child2", {
      content: "Second child also with extremely long text that exceeds the available width easily",
    })

    // Re-render
    board.press("j").press("k")

    // Both children should exist
    board.expect("#child1").toExist()
    board.expect("#child2").toExist()

    // Each child should be exactly 1 row tall (truncated, not wrapped)
    const child1Rect = board.q("#child1").boundingBox()
    const child2Rect = board.q("#child2").boundingBox()
    expect(child1Rect.height).toBe(1)
    expect(child2Rect.height).toBe(1)

    // Children should be on consecutive lines (not taking multiple lines each)
    expect(child2Rect.y).toBe(child1Rect.y + 1)
  })
})

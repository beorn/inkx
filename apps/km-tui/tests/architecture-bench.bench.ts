/**
 * Architecture Correctness Tests
 *
 * Non-timing assertions that verify architectural properties of the board.
 * Timing benchmarks have been moved to architecture.bench.ts.
 *
 * Run: bun vitest run apps/km-tui/tests/architecture-bench.spec.ts
 */

import { describe, test, expect } from "vitest"
import { createDriverTest, item } from "./helpers/board-test.ts"

// =============================================================================
// Fixture: Large board (8 cols × 60 cards × 3 sub-items = 1440+ nodes)
// =============================================================================

function largeBoardFixture(): ReturnType<typeof item> {
  const cols: ReturnType<typeof item>[] = []
  for (let c = 0; c < 8; c++) {
    const cards: ReturnType<typeof item>[] = []
    for (let i = 0; i < 60; i++) {
      const subs: ReturnType<typeof item>[] = []
      for (let s = 0; s < 3; s++) {
        subs.push(item(`c${c}-card-${i}-sub-${s}`))
      }
      cards.push(item(`c${c}-card-${i}`, ...subs))
    }
    cols.push(item(`col-${c}`, ...cards))
  }
  return item("bench-board", ...cols)
}

// =============================================================================
// Correctness Tests
// =============================================================================

describe("Architecture Correctness", { timeout: 30000 }, () => {
  test("cursor correctness after rapid mixed navigation", () => {
    const { board } = createDriverTest(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    // Navigate: down 10, right 4, down 5, left 2, up 3
    for (let i = 0; i < 10; i++) board.command("cursor_down")
    for (let i = 0; i < 4; i++) board.command("cursor_right")
    for (let i = 0; i < 5; i++) board.command("cursor_down")
    for (let i = 0; i < 2; i++) board.command("cursor_left")
    for (let i = 0; i < 3; i++) board.command("cursor_up")

    // Verify cursor is positioned on a valid node
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)

    // Should be in col-2 (moved right 4 then left 2)
    const cursorId = cursor.getAttribute("id")
    expect(cursorId).toMatch(/^c2-card-/)
  })

  test("subscription baseline: visible items × 10 subs", () => {
    const { board } = createDriverTest(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    const items = board.q("[data-view='item']")
    const itemCount = items.count()

    // With 1440 nodes, many more should be visible on 200x60 terminal
    expect(itemCount).toBeGreaterThan(100)
  })

  test("screen diff: j-press changes <= 5 lines", () => {
    const { board } = createDriverTest(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    board.command("cursor_down")
    const before = board.screenshot()
    board.command("cursor_down")
    const after = board.screenshot()

    const beforeLines = before.split("\n")
    const afterLines = after.split("\n")
    let changedLines = 0
    const minLen = Math.min(beforeLines.length, afterLines.length)
    for (let i = 0; i < minLen; i++) {
      if (beforeLines[i] !== afterLines[i]) changedLines++
    }

    // In cards view, cursor movement should change very few lines
    expect(changedLines).toBeLessThanOrEqual(5)
  })
})

/**
 * Navigation Regression Tests for Body Content
 *
 * Tests navigation behavior when files have body content (paragraphs, code blocks, etc.)
 * before the first section/outline item. Body content is rendered as a virtual
 * "Description" column.
 *
 * Regression: km-tui.nav-regression
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/** CSS selector for node with spaces in ID: use attribute selector */
function id(nodeId: string): string {
  return `[id="${nodeId}"]`
}

/** CSS selector for cursor on a node */
function cursor(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

// =============================================================================
// Body + Structural Columns: vertical navigation (j/k)
// =============================================================================

describe("Body content: vertical navigation (j/k)", () => {
  test("j navigates down through body cards", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro-p"),
        item.paragraph("second-p"),
        item.section("sec1", item("task1"), item("task2")),
      ),
    )

    // Initial cursor should be on first body card
    board.expect(cursor("intro-p")).toExist()

    // j moves to next body card
    board.press("j")
    board.expect(cursor("second-p")).toExist()
  })

  test("j at last body card hits boundary (cannot cross to structural column)", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
      ),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // j at last (only) body card — boundary
    board.press("j")
    expect(board.bell).toBe(true)
  })

  test("k at first body card moves to body column header, then board level", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
      ),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // k moves to body column header
    board.press("k")
    board.expect('[id="__body__doc"][data-cursor]').toExist()

    // k again moves to board (root)
    board.press("k")
    board.expect(cursor("doc")).toExist()
  })

  test("k navigates up through body cards", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("p1"),
        item.paragraph("p2"),
        item.paragraph("p3"),
        item.section("sec1", item("task1")),
      ),
    )

    // Navigate to third body card
    board.press("j").press("j")
    board.expect(cursor("p3")).toExist()

    // k moves back up
    board.press("k")
    board.expect(cursor("p2")).toExist()

    board.press("k")
    board.expect(cursor("p1")).toExist()

    // k from first body card to body column header
    board.press("k")
    board.expect('[id="__body__doc"][data-cursor]').toExist()

    // k from body column header to board
    board.press("k")
    board.expect(cursor("doc")).toExist()
  })
})

// =============================================================================
// Body + Structural Columns: horizontal navigation (h/l)
// =============================================================================

describe("Body content: horizontal navigation (h/l)", () => {
  test("l from body card navigates to first structural column card", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1"), item("task2")),
      ),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // l navigates from body column to first structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()
  })

  test("h from structural column card navigates back to body", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
      ),
    )

    // Navigate to structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // h navigates back to body
    board.press("h")
    board.expect(cursor("intro")).toExist()
  })

  test("h at body card is boundary (leftmost)", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
      ),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // h at body column — boundary
    board.press("h")
    expect(board.bell).toBe(true)
  })

  test("l between structural columns works with body present", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
        item.section("sec2", item("task2")),
      ),
    )

    // Navigate to first structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // l to second structural column
    board.press("l")
    board.expect(cursor("task2")).toExist()

    // h back to first structural column
    board.press("h")
    board.expect(cursor("task1")).toExist()

    // h back to body
    board.press("h")
    board.expect(cursor("intro")).toExist()
  })
})

// =============================================================================
// Deep nesting with body content
// =============================================================================

describe("Body content: deep nesting", () => {
  test("j/k works in structural column when body column exists", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1"), item("task2"), item("task3")),
      ),
    )

    // Navigate to structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // j/k within structural column
    board.press("j")
    board.expect(cursor("task2")).toExist()

    board.press("j")
    board.expect(cursor("task3")).toExist()

    board.press("k")
    board.expect(cursor("task2")).toExist()
  })

  test("k from structural card to column header to board", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
      ),
    )

    // Navigate to structural column card
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // k to column header
    board.press("k")
    board.expect(cursor("sec1")).toExist()

    // k to board
    board.press("k")
    board.expect(cursor("doc")).toExist()
  })
})

// =============================================================================
// Only body content (no structural columns)
// =============================================================================

describe("Body content only (no sections)", () => {
  test("j/k through body-only file", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("p1"),
        item.paragraph("p2"),
        item.paragraph("p3"),
      ),
    )

    // Should start on first body card
    board.expect(cursor("p1")).toExist()

    board.press("j")
    board.expect(cursor("p2")).toExist()

    board.press("j")
    board.expect(cursor("p3")).toExist()

    // j at last body card — boundary
    board.press("j")
    expect(board.bell).toBe(true)

    board.press("k")
    board.expect(cursor("p2")).toExist()
  })

  test("h/l at body-only file hits boundary", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("p1"),
        item.paragraph("p2"),
      ),
    )

    board.expect(cursor("p1")).toExist()

    // h — boundary (leftmost)
    board.press("h")
    expect(board.bell).toBe(true)

    // l — boundary (no structural columns)
    board.press("l")
    expect(board.bell).toBe(true)
  })
})

// =============================================================================
// Board level j with body content (potential regression)
// =============================================================================

describe("Board-level j/k with body content", () => {
  test("j from board level goes to first body card", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
        item.section("sec2", item("task2")),
      ),
    )

    // Navigate to board level (k → body column header, k → board)
    board.press("k") // first body card -> body column header
    board.press("k") // body column header -> board
    board.expect(cursor("doc")).toExist()

    // j from board level — stickyX not set, defaults to index 0
    // repo.getChildren returns [intro, sec1, sec2]
    // index 0 = intro (paragraph, body content)
    board.press("j")
    board.expect(cursor("intro")).toExist()
  })

  test("j from board level goes to structural column when stickyX remembers it", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.section("sec1", item("task1")),
        item.section("sec2", item("task2")),
      ),
    )

    // Navigate right to structural column, then up to column header, then up to board
    board.press("l") // body -> sec1 card
    board.expect(cursor("task1")).toExist()

    board.press("k") // card -> column header
    board.expect(cursor("sec1")).toExist()

    board.press("k") // column header -> board (saves stickyX)
    board.expect(cursor("doc")).toExist()

    // j from board with stickyX set
    // stickyX was set by indexOfChild(columns, "sec1") where columns = repo.getChildren(rootId)
    // repo.getChildren = [intro, sec1, sec2], sec1 is at index 1
    // So stickyX = 1, and columns[1] = sec1
    board.press("j")
    board.expect(cursor("sec1")).toExist()
  })

  test("j from board after navigating from body card up goes back to body", () => {
    const { board } = testEnv(() =>
      item.file("doc",
        item.paragraph("intro"),
        item.paragraph("detail"),
        item.section("sec1", item("task1")),
      ),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // Go down to second body card
    board.press("j")
    board.expect(cursor("detail")).toExist()

    // k three times: second body card → first body card → body column header → board
    board.press("k")
    board.expect(cursor("intro")).toExist()
    board.press("k") // body column header
    board.press("k") // board
    board.expect(cursor("doc")).toExist()

    // j from board — stickyX not set (body cards don't save stickyX)
    board.press("j")
    board.expect(cursor("intro")).toExist()
  })
})

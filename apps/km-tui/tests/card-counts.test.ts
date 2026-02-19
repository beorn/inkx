/**
 * Card count indicator tests.
 *
 * Feature: km-tui.card-counts
 * Cards with children (subtasks) show a compact dimmed count indicator
 * after the card title in cards view. This helps users see at a glance
 * how many subtasks a card has, similar to Asana/Trello.
 *
 * The count is rendered as a separate dimmed Text element in the title line,
 * only visible in cards view where the right-aligned child count is hidden.
 * In columns/list view, the traditional right-aligned count is shown instead.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// =============================================================================
// Integration: card count display in cards view
// =============================================================================

describe("card count in cards view", () => {
  test("card with children shows dimmed count indicator", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col", item("parent", item("child1"), item("child2"), item("child3"))),
        ),
      { columns: 60, rows: 24 },
    )

    // The card title "parent" should have a count indicator showing "3"
    // (3 children). It appears as a dimmed number after the title.
    const box = board.screen.nodeBox("parent")
    expect(box, "parent card should exist").not.toBeNull()
    if (!box) return

    // Scan the title line for the count "3"
    let found3 = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.char === "3") {
        found3 = true
        // The count should be dimmed
        expect(
          (cell.attrs as Record<string, unknown>).dim,
          `count "3" at (${x},${box.y}) should be dimmed`,
        ).toBe(true)
        break
      }
    }
    expect(found3, 'count "3" should appear on the card title line').toBe(true)
  })

  test("card with single child shows count 1", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("solo-parent", item("only-child")))),
      { columns: 60, rows: 24 },
    )

    const box = board.screen.nodeBox("solo-parent")
    expect(box, "solo-parent should exist").not.toBeNull()
    if (!box) return

    let found1 = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.char === "1") {
        found1 = true
        expect(
          (cell.attrs as Record<string, unknown>).dim,
          `count "1" at (${x},${box.y}) should be dimmed`,
        ).toBe(true)
        break
      }
    }
    expect(found1, 'count "1" should appear on the card title line').toBe(true)
  })

  test("leaf card (no children) does not show count", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("leaf-task"))),
      { columns: 60, rows: 24 },
    )

    const box = board.screen.nodeBox("leaf-task")
    expect(box, "leaf-task should exist").not.toBeNull()
    if (!box) return

    // "leaf-task" contains no digits, so any digit on the title line
    // would be a count indicator (which should not exist for leaf nodes)
    let foundDigit = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (/\d/.test(cell.char)) {
        foundDigit = true
        break
      }
    }
    expect(foundDigit, "leaf node should not have a count indicator").toBe(false)
  })

  test("count reflects total children, not just visible ones", () => {
    // Create a card with many children (more than maxContentLines)
    // The count should show total, not just visible
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item(
              "big-parent",
              item("c1"),
              item("c2"),
              item("c3"),
              item("c4"),
              item("c5"),
              item("c6"),
              item("c7"),
            ),
          ),
        ),
      { columns: 60, rows: 30 },
    )

    const box = board.screen.nodeBox("big-parent")
    expect(box, "big-parent should exist").not.toBeNull()
    if (!box) return

    // Should show "7" on the title line
    let found7 = false
    for (let x = box.x; x < box.x + box.width; x++) {
      const cell = board.screen.cell(x, box.y)
      if (cell.char === "7") {
        found7 = true
        break
      }
    }
    expect(found7, 'count "7" should appear on the card title line').toBe(true)
  })
})

// =============================================================================
// Integration: columns view uses right-aligned count (not inline)
// =============================================================================

describe("columns view child count", () => {
  test("columns view shows right-aligned count, not inline", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col", item("parent", item("child1"), item("child2"))),
        ),
      { columns: 60, rows: 24, viewMode: "columns" },
    )

    // In columns view, hideChildCount is false, so the right-aligned count
    // is shown. The "2" should be visible somewhere on screen.
    board.expectScreen("2")
  })
})

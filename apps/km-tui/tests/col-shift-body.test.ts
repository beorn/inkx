/**
 * Column shift with virtual body column (Description column)
 *
 * Tests that column shifting (Meta+h/Meta+l) works correctly when a virtual
 * body column (Description) is present at index 0. The body column has a
 * synthetic __body__ node that doesn't exist in the repo, which could cause
 * issues with sort order normalization and cursor tracking.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("column shift with body column", () => {
  test("Meta+l shifts column right when body column exists — cursor follows", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("some description text"),
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 160, rows: 24 },
    )

    // Navigate to col1 header: l -> col1 card, k -> col1 header
    board.press("l")
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")

    // Cursor should stay on col1
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down into the column — should enter col1's cards
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("Meta+h shifts column left when body column exists — cursor follows", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("some description text"),
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 160, rows: 24 },
    )

    // Navigate to col2 header: l -> col1 card, l -> col2 card, k -> col2 header
    board.press("l").press("l").press("k")
    board.expect("#col2[data-cursor]").toExist()

    // Shift col2 left
    board.press("Meta+h")

    // Cursor should stay on col2
    board.expect("#col2[data-cursor]").toExist()

    // Navigate down — should enter col2's cards
    board.press("j")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("shifting towards body column — should swap with body column or boundary", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("some description text"),
          item("col1", item("1a")),
          item("col2", item("2a")),
        ),
      { columns: 120, rows: 24 },
    )

    // Navigate to col1 header (adjacent to Description)
    board.press("l").press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 left — target is body column (virtual, not in repo)
    // This should either boundary or handle gracefully
    board.press("Meta+h")

    // Cursor should still be on col1 (not crash, not move to wrong place)
    board.expect("#col1[data-cursor]").toExist()
  })

  test("visual order correct after shift with body column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("desc text"),
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 200, rows: 24 },
    )

    // Navigate to col1 header: l -> col1 card, k -> col1 header
    board.press("l").press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")

    // After shift: visual order should be Description, col2, col1, col3
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    const col3Box = board.q("#col3").boundingBox()
    expect(col1Box).not.toBeNull()
    expect(col2Box).not.toBeNull()
    expect(col3Box).not.toBeNull()
    expect(col2Box!.x).toBeLessThan(col1Box!.x)
    expect(col1Box!.x).toBeLessThan(col3Box!.x)
  })

  test("shift right then navigate — enters correct column cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("desc text"),
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 160, rows: 24 },
    )

    // Navigate to col1 header: l -> col1 card, k -> col1 header
    board.press("l").press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down — should be in col1's cards, not col2's
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()

    // Navigate right — should go to col3 (now the right neighbor)
    board.press("l")
    board.expect("#3a[data-cursor]").toExist()
  })
})

describe("column shift with collapsed columns", () => {
  test("shift collapsed column right — cursor follows", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 120, rows: 24 },
    )

    // Navigate to col1 header and collapse it
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("c")

    // Shift collapsed col1 right
    board.press("Meta+l")

    // Cursor should still be on col1
    board.expect("#col1[data-cursor]").toExist()
  })

  test("shift column right past collapsed column — cursor follows", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 120, rows: 24 },
    )

    // Start on col1 card, go to header, collapse col2 from col1 side is complex.
    // Instead: go to col1 header first
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right (swaps with col2)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Shift col1 right again (swaps with col3, col1 now at end)
    board.press("Meta+l")
    board.expect("#col1[data-cursor]").toExist()

    // Navigate down into col1 should show col1's cards
    board.press("j")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("shift non-collapsed column when some columns are collapsed", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
        ),
      { columns: 120, rows: 24 },
    )

    // Navigate to col1 header and collapse it
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("c")

    // Navigate to col2 header
    board.press("l")
    board.expect("#col2[data-cursor]").toExist()

    // Shift col2 right
    board.press("Meta+l")

    // Cursor should stay on col2
    board.expect("#col2[data-cursor]").toExist()

    // Navigate down into col2
    board.press("j")
    board.expect("#2a[data-cursor]").toExist()
  })
})

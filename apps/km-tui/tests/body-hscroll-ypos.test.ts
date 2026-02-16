/**
 * Test: body h/l navigation should use registry Y-positions, not fallbacks.
 *
 * Bug: km-tui.virtual-nav (reopened)
 * Verifies that navigating l/h from body cards uses registry Y-matching
 * to land on the correct card in the target column.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("body h/l navigation Y-position matching", () => {
  test("l from 3rd body card goes to Y-matched card in structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body-1"),
          item.paragraph("body-2"),
          item.paragraph("body-3"),
          item.paragraph("body-4"),
          item.paragraph("body-5"),
          item("col1", item("task-a"), item("task-b"), item("task-c"), item("task-d"), item("task-e")),
        ),
      { rows: 40 },
    )

    board.expect("#body-1[data-cursor]").toExist()
    board.press("j") // → body-2
    board.press("j") // → body-3
    board.expect("#body-3[data-cursor]").toExist()

    // l should land on task-c (same Y as body-3), not task-a (first)
    board.press("l")
    board.expect("#task-c[data-cursor]").toExist()
  })

  test("l from body-1 goes to task-a (both at top)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body-1"),
          item("col1", item("task-a"), item("task-b"), item("task-c")),
        ),
      { rows: 40 },
    )

    board.expect("#body-1[data-cursor]").toExist()
    board.press("l")
    board.expect("#task-a[data-cursor]").toExist()
  })

  test("l from body card then h back preserves Y position", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("bp-1"),
          item.paragraph("bp-2"),
          item.paragraph("bp-3"),
          item("s1", item("t-1"), item("t-2"), item("t-3")),
        ),
      { rows: 40 },
    )

    board.press("j") // → bp-2
    board.press("j") // → bp-3
    board.expect("#bp-3[data-cursor]").toExist()

    board.press("l")
    const rightTarget = board.q("[data-cursor]").getAttribute("id")
    expect(rightTarget).not.toBe("bp-1") // Should not jump to top

    board.press("h")
    const backTarget = board.q("[data-cursor]").getAttribute("id")
    expect(backTarget).toMatch(/^bp-/)
  })

  test("l from structural column card goes to next column at same Y", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1"), item("a2"), item("a3"), item("a4"), item("a5")),
          item("col2", item("b1"), item("b2"), item("b3"), item("b4"), item("b5")),
        ),
      { rows: 40 },
    )

    // Cursor starts on first card (a1), navigate to a3
    board.expect("#a1[data-cursor]").toExist()
    board.press("j") // → a2
    board.press("j") // → a3
    board.expect("#a3[data-cursor]").toExist()

    // l to col2 — should go to b3 (same Y), not b1
    board.press("l")
    board.expect("#b3[data-cursor]").toExist()
  })
})

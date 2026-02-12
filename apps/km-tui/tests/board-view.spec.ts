/**
 * Board Acceptance Tests - View Controls
 *
 * Tests for fold/collapse (z/Z/c), outline depth (</>), content lines (+/-),
 * task status (space), and column jump (!/@/#).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

// =============================================================================
// Column Fold/Collapse
// =============================================================================

describe("Column Fold/Collapse", () => {
  test("z folds all cards in current column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a", item("sub1"), item("sub2")), item("1b", item("sub3"))),
        item("col2", item("2a")),
      ),
    )
    board.expect("#sub1").toExist()
    board.expect("#sub2").toExist()
    board.expect("#sub3").toExist()

    board.press("z")
    board.expect("#sub1").not.toExist()
    board.expect("#sub2").not.toExist()
    board.expect("#sub3").not.toExist()
  })

  test("Z unfolds all cards in current column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a", item("sub1"), item("sub2")), item("1b", item("sub3"))),
        item("col2", item("2a")),
      ),
    )
    // Fold all first
    board.press("z")
    board.expect("#sub1").not.toExist()
    board.expect("#sub3").not.toExist()

    // Z unfolds all cards in current column
    board.press("Z")
    board.expect("#sub1").toExist()
    board.expect("#sub2").toExist()
    board.expect("#sub3").toExist()
  })

  test("z only affects current column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a", item("sub1"))), item("col2", item("2a", item("sub2")))),
    )
    board.expect("#sub1").toExist()
    board.expect("#sub2").toExist()

    // z folds col1 only (cursor starts in col1)
    board.press("z")
    board.expect("#sub1").not.toExist()
    board.expect("#sub2").toExist() // col2 unaffected
  })

  test("c toggles column collapse", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
    )
    board.expect("#1a").toExist()
    board.expect("#1b").toExist()

    // c collapses current column
    board.press("c")
    const output = board.screenshot()
    expect(output).toContain("[collapsed")

    // c again un-collapses
    board.press("c")
    board.expect("#1a").toExist()
    board.expect("#1b").toExist()
  })

  test("c on different column collapses that column", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"))))
    // Move to col2
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    // Collapse col2
    board.press("c")
    const output = board.screenshot()
    expect(output).toContain("[collapsed")

    // col1 should still show its cards
    board.expect("#1a").toExist()
  })
})

// =============================================================================
// Outline Depth and Content Lines
// =============================================================================

describe("Outline Depth and Content Lines", () => {
  test("< decreases outline depth, hiding deeper children", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1", item("deep1"))))))
    board.expect("#sub1").toExist()

    // Decrease depth twice to reach 0 (from default 2)
    board.press("<")
    board.press("<")

    // At depth 0, children beyond immediate cards should be hidden
    board.expect("#sub1").not.toExist()
  })

  test("> increases outline depth, showing deeper children", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1", item("deep1"))))))
    // Decrease to 0 first
    board.press("<")
    board.press("<")
    board.expect("#sub1").not.toExist()

    // Increase back
    board.press(">")
    board.press(">")
    board.expect("#sub1").toExist()
  })

  test("< has minimum of 0", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1")))))
    // Press < many times - should not error
    for (let i = 0; i < 5; i++) board.press("<")

    // Cards in column are always visible (depth 0 = card titles only)
    board.expect("#1a").toExist()
    board.expect("#sub1").not.toExist()
  })

  test("> has maximum of 10", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a", item("sub1")))))
    // Press > many times - should not error
    for (let i = 0; i < 15; i++) board.press(">")

    board.expect("#1a").toExist()
    board.expect("#sub1").toExist()
  })

  test("+ increases content lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.press("+")
    board.expect("#1a").toExist()
  })

  test("= also increases content lines (alias)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.press("=")
    board.expect("#1a").toExist()
  })

  test("- decreases content lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    board.press("-")
    board.expect("#1a").toExist()
  })

  test("- has minimum of 1 content line", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Press - many times past minimum
    for (let i = 0; i < 10; i++) board.press("-")
    board.expect("#1a").toExist()
  })

  test("+ has maximum of 10 content lines", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))
    // Press + many times past maximum
    for (let i = 0; i < 15; i++) board.press("+")
    board.expect("#1a").toExist()
  })
})

// =============================================================================
// Task Status
// =============================================================================

describe("Task Status", () => {
  test("space cycles task status through multiple states", () => {
    // Use item.task() which sets task_status: "todo" (required for isTask)
    const { board } = testEnv(() => item("board", item("col", item.task("task"))))
    board.expect("#task[data-cursor]").toExist()

    // todo → wip (both show □, but different colors in ANSI)
    board.press(" ")
    board.expect("#task[data-cursor]").toExist()

    // wip → blocked (shows ✗ U+2717)
    board.press(" ")
    const output = board.screenshot()
    expect(output).toContain("\u2717") // ✗ blocked icon
  })

  test("space on task does not affect other cards", () => {
    const { board } = testEnv(() => item("board", item("col", item.task("task1"), item.task("task2"))))
    board.expect("#task1[data-cursor]").toExist()

    // Pressing space cycles task1's status, task2 unchanged
    board.press(" ")
    board.expect("#task1[data-cursor]").toExist()
    board.expect("#task2").toExist()
  })
})

// =============================================================================
// Column Jump
// =============================================================================

describe("Column Jump", () => {
  test("! jumps to first card in column 1", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    // Move to col2 first
    board.press("l")
    board.expect("#2a[data-cursor]").toExist()

    // ! jumps back to col1
    board.press("!")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("@ jumps to first card in column 2", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("@")
    board.expect("#2a[data-cursor]").toExist()
  })

  test("# jumps to first card in column 3", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    board.expect("#1a[data-cursor]").toExist()

    board.press("#")
    board.expect("#3a[data-cursor]").toExist()
  })

  test("column jump to non-existent column is a boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    // Only 2 columns, # targets column 3 which doesn't exist
    board.press("#")
    board.expect("#1a[data-cursor]").toExist()
    expect(board.bell).toBe(true)
  })

  test("! from deep in column 2 jumps to column 1 first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"), item("2c"))),
    )
    // Navigate to last card in col2
    board.press("l")
    board.press("G")
    board.expect("#2c[data-cursor]").toExist()

    board.press("!")
    board.expect("#1a[data-cursor]").toExist()
  })

  test("@ when already in column 2 jumps to first card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b"), item("2c"))),
    )
    // Navigate to last card in col2
    board.press("l")
    board.press("G")
    board.expect("#2c[data-cursor]").toExist()

    board.press("@")
    board.expect("#2a[data-cursor]").toExist()
  })
})

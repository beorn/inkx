/**
 * km-tui.single-col-missing-top-borders regression test.
 *
 * Bug: in a single-column vault with 2+ cards, cards after the first
 * render WITHOUT their top `╭───╮` border. Instead the content row is
 * prefixed with `│` and followed by `─────────│`, then `╰───╯` on the
 * next row. Task 1 always renders correctly.
 *
 * Repro from the `bun km view /tmp/km-single-col` session:
 *
 *     ╭──────────────────...────────╮
 *     │ Task 1                     │
 *     ╰──────────────────...────────╯
 *
 *     │ Task 2─────────────...─────│   <- top border row MISSING
 *     ╰──────────────────...────────╯
 *
 * The bug does NOT reproduce with multi-column layouts (3+ columns) —
 * only when the column fills the whole terminal width.
 *
 * This test asserts that the left-border character at the row just above
 * the content row is a top-border character (`╭`) for every card in a
 * single-column board.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("km-tui.single-col-missing-top-borders", () => {
  test("single-column board: every card renders a top border row", async () => {
    // Structural cards: each Task is an `# H1` file — matches what `bun km
    // view /tmp/km-single-col` produces where each `t1.md` → `# Task 1` is a
    // file (mdfile) with a heading. Leaf `item()` calls would produce body
    // cards (no border), which doesn't reproduce the bug.
    using app = createTestApp(
      item.root(
        "board",
        item(
          "inbox",
          item.file("t1.md", item.section("Task 1")),
          item.file("t2.md", item.section("Task 2")),
          item.file("t3.md", item.section("Task 3")),
        ),
      ),
      { cols: 120, rows: 40, backend: "termless" },
    )
    // Termless renders async — wait for handleReady + initial render to settle.
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Each card's nodeBox is the TreeNode content area INSIDE the Card border.
    // The left border sits at box.x - 1; the top border sits at box.y - 1.
    // A correctly-rendered card has `╭` at (box.x - 1, box.y - 1).
    for (const id of ["t1.md", "t2.md", "t3.md"]) {
      const box = app.screen.nodeBox(id)
      expect(box, `nodeBox missing for "${id}"`).not.toBeNull()
      if (!box) continue

      const topLeft = app.screen.cell(box.x - 1, box.y - 1)
      expect(
        topLeft.char,
        `card "${id}" top-left corner at (${box.x - 1},${box.y - 1}): got '${topLeft.char}' (expected '╭')`,
      ).toBe("╭")

      // Also check the top edge is filled with `─` — the bug replaces this
      // entire row with blank/part-of-content.
      const topMid = app.screen.cell(box.x + 5, box.y - 1)
      expect(
        topMid.char,
        `card "${id}" top edge at (${box.x + 5},${box.y - 1}): got '${topMid.char}' (expected '─')`,
      ).toBe("─")
    }
  })
})

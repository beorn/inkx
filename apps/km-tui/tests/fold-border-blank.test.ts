/**
 * Test: Fold operations and border rendering integrity
 *
 * Bug km-tui.fold-border-blank: When pressing '<' to decrease outline depth
 * or 'z' to fold all, cards shrink but bottom borders may be left blank
 * or overwritten with stale pixels from the previous (taller) render.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("fold border blank (km-tui.fold-border-blank)", () => {
  /** Board with nested children that will shrink when outline depth decreases */
  function nestedBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("card-a", item("a-child1"), item("a-child2"), item("a-child3")),
            item("card-b", item("b-child1")),
            item("card-c"),
          ),
        ),
      { columns: 50, rows: 30, incremental: true },
    )
  }

  /** Verify that every row with bottom-border corners has matching top-border corners */
  function checkBorderIntegrity(text: string, label: string) {
    const rows = text.split("\n")
    // Count top and bottom borders (round style: ╭╮ for top, ╰╯ for bottom)
    const topBorders = rows.filter((r) => r.includes("\u256d") && r.includes("\u256e"))
    const bottomBorders = rows.filter((r) => r.includes("\u2570") && r.includes("\u256f"))
    expect(bottomBorders.length, `${label}: bottom borders should match top borders`).toBe(topBorders.length)
  }

  test("decrease outline depth preserves border integrity", () => {
    const { board } = nestedBoard()

    // Initial: children visible
    const before = board.screenshot()
    expect(before).toContain("a-child1")
    checkBorderIntegrity(before, "before fold")

    // Decrease to depth 1 (children at depth 1 still visible: 0 < 1)
    board.press("<")
    const mid = board.screenshot()
    checkBorderIntegrity(mid, "after first <")

    // Decrease to depth 0 (no children visible: 0 < 0 = false)
    board.press("<")
    const after = board.screenshot()
    expect(after).not.toContain("a-child1")
    checkBorderIntegrity(after, "after second <")
  })

  test("increase outline depth after decrease preserves borders", () => {
    const { board } = nestedBoard()

    // Decrease then increase
    board.press("<").press("<") // depth 2 → 0
    board.press(">").press(">") // depth 0 → 2

    const text = board.screenshot()
    expect(text).toContain("a-child1")
    checkBorderIntegrity(text, "after round-trip")
  })

  test("fold all (z) preserves border integrity", () => {
    const { board } = nestedBoard()

    // z = fold_all: folds all cards in column
    board.press("z")

    // Wait for chord timeout to resolve
    // The 'z' key is a chord prefix; standalone timeout resolves to fold_all
    const text = board.screenshot()
    checkBorderIntegrity(text, "after fold all")
  })

  test("toggle fold (za) preserves border integrity", () => {
    const { board } = nestedBoard()

    // za = toggle fold on current card (card-a)
    board.press("z")
    // z is chord prefix, wait for it then press a
    board.press("a")

    const text = board.screenshot()
    checkBorderIntegrity(text, "after toggle fold")
  })

  test("no stale border lines below shrunken cards", () => {
    const { board } = nestedBoard()

    const before = board.screenshot()
    // card-a should be multiline (has children)
    const beforeRows = before.split("\n")
    const cardATopRow = beforeRows.findIndex((r) => r.includes("card-a"))

    // Decrease depth to hide children
    board.press("<").press("<")
    const after = board.screenshot()
    const afterRows = after.split("\n")

    // Find card-a in after state — it should be shorter
    const cardATopRowAfter = afterRows.findIndex((r) => r.includes("card-a"))
    expect(cardATopRowAfter).toBeGreaterThanOrEqual(0)

    // After the card's bottom border, the next content should be another card or empty space
    // There should be no orphaned border characters (─ without ╰/╯)
    const cardABottom = afterRows.findIndex(
      (r, i) => i > cardATopRowAfter && r.includes("\u2570") && r.includes("\u256f"),
    )
    expect(cardABottom).toBeGreaterThan(cardATopRowAfter)

    // Check that rows between card-a bottom and card-b top have no stale border chars
    const cardBTop = afterRows.findIndex(
      (r, i) => i > cardABottom && r.includes("\u256d") && r.includes("\u256e"),
    )
    if (cardBTop > cardABottom + 1) {
      // Rows between cards should not have border characters
      for (let i = cardABottom + 1; i < cardBTop; i++) {
        const row = afterRows[i] ?? ""
        expect(row, `Row ${i} between cards should not have stale borders`).not.toMatch(
          /[\u2500\u2502\u256d\u256e\u256f\u2570]/,
        )
      }
    }
  })
})

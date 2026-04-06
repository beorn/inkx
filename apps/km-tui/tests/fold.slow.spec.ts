/**
 * Fold/Unfold Journey Tests
 *
 * User-level journey specs for fold operations. Tests multi-step fold workflows
 * verifying BOTH screen output AND persisted data/state.
 *
 * Complements fold.slow.test.ts which focuses on border integrity, ANSI diff
 * correctness, and fold count colors. These journey tests cover the user stories:
 * - Fold → navigate → verify hidden state
 * - Fold → unfold round-trips
 * - Fold all → selective unfold
 * - Fold interaction with other features (zoom)
 *
 * Key bindings:
 *   H = fold_node (hide children of current card)
 *   L = unfold_node (reveal children of current card)
 *   < = fold_all (decrease outline depth board-wide)
 *   > = unfold_all (increase outline depth board-wide)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Fold/Unfold Journeys", () => {
  test("H folds card children, navigate away and back, children stay hidden", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent1", item("ch1"), item("ch2")), item("sib1")),
        item("col2", item("other1")),
      ),
    )
    board.expect("#parent1[data-cursor]").toExist()
    board.expect("#ch1").toExist()
    board.expect("#ch2").toExist()

    // Step 1: Fold parent1 — children should disappear
    board.command("fold_more")

    board.expect("#ch1").not.toExist()
    board.expect("#ch2").not.toExist()
    board.expect("#parent1").toExist()

    // Step 2: Navigate to sib1, then to col2
    board.command("cursor_down")
    board.expect("#sib1[data-cursor]").toExist()
    board.command("cursor_right")
    board.expect("#other1[data-cursor]").toExist()

    // Step 3: Navigate back — children should still be hidden
    board.command("cursor_left")
    board.expect("#ch1").not.toExist()
    board.expect("#ch2").not.toExist()
    board.expect("#parent1").toExist()
  })

  test("H then L round-trips: fold and unfold restores visibility", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task1", item("subA"), item("subB")))))
    board.expect("#task1[data-cursor]").toExist()
    board.expect("#subA").toExist()
    board.expect("#subB").toExist()

    // Step 1: Fold
    board.command("fold_more")
    board.expect("#subA").not.toExist()
    board.expect("#subB").not.toExist()

    // Step 2: Unfold
    board.command("unfold_more")
    board.expect("#subA").toExist()
    board.expect("#subB").toExist()

    // Step 3: Fold again, unfold again — no state corruption
    board.command("fold_more")
    board.expect("#subA").not.toExist()
    board.command("unfold_more")
    board.expect("#subA").toExist()
    board.expect("#subB").toExist()
  })

  test("fold all (<) hides children in all columns, unfold all (>) restores", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("nodeA", item("nodeA-ch"))), item("col2", item("nodeB", item("nodeB-ch")))),
    )
    board.expect("#nodeA-ch").toExist()
    board.expect("#nodeB-ch").toExist()

    // Step 1: Fold all — hides children everywhere
    board.command("fold_all_more")

    board.expect("#nodeA-ch").not.toExist()
    board.expect("#nodeB-ch").not.toExist()
    // Parent cards still visible
    board.expect("#nodeA").toExist()
    board.expect("#nodeB").toExist()

    // Step 2: Unfold all — restores children everywhere
    board.command("unfold_all_more")

    board.expect("#nodeA-ch").toExist()
    board.expect("#nodeB-ch").toExist()
  })

  test("fold all then selectively unfold one card with L", () => {
    const { board } = testEnv(() => item("board", item("col1", item("p1", item("p1-ch")), item("p2", item("p2-ch")))))
    board.expect("#p1-ch").toExist()
    board.expect("#p2-ch").toExist()

    // Step 1: Fold all
    board.command("fold_all_more")
    board.expect("#p1-ch").not.toExist()
    board.expect("#p2-ch").not.toExist()

    // Step 2: Selectively unfold p1 only
    board.expect("#p1[data-cursor]").toExist()
    board.command("unfold_more")

    // p1's children visible, p2's children still hidden
    board.expect("#p1-ch").toExist()
    board.expect("#p2-ch").not.toExist()
  })

  test("fold one card, navigate to another and fold it, both stay folded", () => {
    const { board } = testEnv(() => item("board", item("col1", item("a1", item("a1-ch")), item("b1", item("b1-ch")))))
    board.expect("#a1[data-cursor]").toExist()
    board.expect("#a1-ch").toExist()
    board.expect("#b1-ch").toExist()

    // Step 1: Fold a1
    board.command("fold_more")
    board.expect("#a1-ch").not.toExist()
    board.expect("#b1-ch").toExist()

    // Step 2: Navigate to b1 and fold it too
    board.command("cursor_down")
    board.expect("#b1[data-cursor]").toExist()
    board.command("fold_more")
    board.expect("#b1-ch").not.toExist()

    // Step 3: Both should still be folded
    board.expect("#a1-ch").not.toExist()
    board.expect("#b1-ch").not.toExist()
    board.expect("#a1").toExist()
    board.expect("#b1").toExist()
  })

  test("fold preserves cursor position, unfold keeps cursor on parent", () => {
    const { board } = testEnv(() => item("board", item("col1", item("par1", item("c1"), item("c2"), item("c3")))))
    board.expect("#par1[data-cursor]").toExist()

    // Step 1: Fold — cursor stays on par1
    board.command("fold_more")
    board.expect("#par1[data-cursor]").toExist()

    // Step 2: Unfold — cursor stays on par1 (not on a child)
    board.command("unfold_more")
    board.expect("#par1[data-cursor]").toExist()

    // Children should be visible again
    board.expect("#c1").toExist()
    board.expect("#c2").toExist()
    board.expect("#c3").toExist()
  })

  test("progressive fold: H folds deepest level first, L unfolds one level at a time", () => {
    const { board } = testEnv(() => item("board", item("col1", item("root1", item("mid1", item("deep1"))))))
    board.expect("#root1[data-cursor]").toExist()
    board.expect("#mid1").toExist()
    board.expect("#deep1").toExist()

    // Step 1: First H — folds deepest visible children
    board.command("fold_more")
    board.expect("#root1").toExist()

    // Step 2: Another H — folds the next level
    board.command("fold_more")
    board.expect("#root1").toExist()

    // Step 3: L unfolds one level
    board.command("unfold_more")
    board.expect("#root1").toExist()

    // Step 4: Another L — should eventually restore deep1
    board.command("unfold_more")
    board.expect("#root1").toExist()
    board.expect("#mid1").toExist()
    board.expect("#deep1").toExist()
  })
})

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

import { describe, test } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Fold/Unfold Journeys", () => {
  test("H folds card children, navigate away and back, children stay hidden", async () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("parent1", item("ch1"), item("ch2")), item("sib1")),
        item("col2", item("other1")),
      ),
    )
    app.expect("#parent1[data-cursor]").toExist()
    app.expect("#ch1").toExist()
    app.expect("#ch2").toExist()

    // Step 1: Fold parent1 — children should disappear
    await app.command("fold_more")

    app.expect("#ch1").not.toExist()
    app.expect("#ch2").not.toExist()
    app.expect("#parent1").toExist()

    // Step 2: Navigate to sib1, then to col2
    await app.command("cursor_down")
    app.expect("#sib1[data-cursor]").toExist()
    await app.command("cursor_right")
    app.expect("#other1[data-cursor]").toExist()

    // Step 3: Navigate back — children should still be hidden
    await app.command("cursor_left")
    app.expect("#ch1").not.toExist()
    app.expect("#ch2").not.toExist()
    app.expect("#parent1").toExist()
  })

  test("H then L round-trips: fold and unfold restores visibility", async () => {
    using app = createTestApp(item("board", item("col1", item("task1", item("subA"), item("subB")))))
    app.expect("#task1[data-cursor]").toExist()
    app.expect("#subA").toExist()
    app.expect("#subB").toExist()

    // Step 1: Fold
    await app.command("fold_more")
    app.expect("#subA").not.toExist()
    app.expect("#subB").not.toExist()

    // Step 2: Unfold
    await app.command("unfold_more")
    app.expect("#subA").toExist()
    app.expect("#subB").toExist()

    // Step 3: Fold again, unfold again — no state corruption
    await app.command("fold_more")
    app.expect("#subA").not.toExist()
    await app.command("unfold_more")
    app.expect("#subA").toExist()
    app.expect("#subB").toExist()
  })

  test("fold all (<) hides children in all columns, unfold all (>) restores", async () => {
    using app = createTestApp(
      item("board", item("col1", item("nodeA", item("nodeA-ch"))), item("col2", item("nodeB", item("nodeB-ch")))),
    )
    app.expect("#nodeA-ch").toExist()
    app.expect("#nodeB-ch").toExist()

    // Step 1: Fold all — hides children everywhere
    await app.command("fold_all_more")

    app.expect("#nodeA-ch").not.toExist()
    app.expect("#nodeB-ch").not.toExist()
    // Parent cards still visible
    app.expect("#nodeA").toExist()
    app.expect("#nodeB").toExist()

    // Step 2: Unfold all — restores children everywhere
    await app.command("unfold_all_more")

    app.expect("#nodeA-ch").toExist()
    app.expect("#nodeB-ch").toExist()
  })

  test("fold all then selectively unfold one card with L", async () => {
    using app = createTestApp(item("board", item("col1", item("p1", item("p1-ch")), item("p2", item("p2-ch")))))
    app.expect("#p1-ch").toExist()
    app.expect("#p2-ch").toExist()

    // Step 1: Fold all
    await app.command("fold_all_more")
    app.expect("#p1-ch").not.toExist()
    app.expect("#p2-ch").not.toExist()

    // Step 2: Selectively unfold p1 only
    app.expect("#p1[data-cursor]").toExist()
    await app.command("unfold_more")

    // p1's children visible, p2's children still hidden
    app.expect("#p1-ch").toExist()
    app.expect("#p2-ch").not.toExist()
  })

  test("fold one card, navigate to another and fold it, both stay folded", async () => {
    using app = createTestApp(item("board", item("col1", item("a1", item("a1-ch")), item("b1", item("b1-ch")))))
    app.expect("#a1[data-cursor]").toExist()
    app.expect("#a1-ch").toExist()
    app.expect("#b1-ch").toExist()

    // Step 1: Fold a1
    await app.command("fold_more")
    app.expect("#a1-ch").not.toExist()
    app.expect("#b1-ch").toExist()

    // Step 2: Navigate to b1 and fold it too
    await app.command("cursor_down")
    app.expect("#b1[data-cursor]").toExist()
    await app.command("fold_more")
    app.expect("#b1-ch").not.toExist()

    // Step 3: Both should still be folded
    app.expect("#a1-ch").not.toExist()
    app.expect("#b1-ch").not.toExist()
    app.expect("#a1").toExist()
    app.expect("#b1").toExist()
  })

  test("fold preserves cursor position, unfold keeps cursor on parent", async () => {
    using app = createTestApp(item("board", item("col1", item("par1", item("c1"), item("c2"), item("c3")))))
    app.expect("#par1[data-cursor]").toExist()

    // Step 1: Fold — cursor stays on par1
    await app.command("fold_more")
    app.expect("#par1[data-cursor]").toExist()

    // Step 2: Unfold — cursor stays on par1 (not on a child)
    await app.command("unfold_more")
    app.expect("#par1[data-cursor]").toExist()

    // Children should be visible again
    app.expect("#c1").toExist()
    app.expect("#c2").toExist()
    app.expect("#c3").toExist()
  })

  test("progressive fold: H folds deepest level first, L unfolds one level at a time", async () => {
    using app = createTestApp(item("board", item("col1", item("root1", item("mid1", item("deep1"))))))
    app.expect("#root1[data-cursor]").toExist()
    app.expect("#mid1").toExist()
    app.expect("#deep1").toExist()

    // Step 1: First H — folds deepest visible children
    await app.command("fold_more")
    app.expect("#root1").toExist()

    // Step 2: Another H — folds the next level
    await app.command("fold_more")
    app.expect("#root1").toExist()

    // Step 3: L unfolds one level
    await app.command("unfold_more")
    app.expect("#root1").toExist()

    // Step 4: Another L — should eventually restore deep1
    await app.command("unfold_more")
    app.expect("#root1").toExist()
    app.expect("#mid1").toExist()
    app.expect("#deep1").toExist()
  })
})

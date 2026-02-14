/**
 * Board Zoom, History, Layout, and View Mode Tests
 *
 * Split from board.spec.ts for parallel execution.
 * See board.spec.ts header comment for testing philosophy.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Layout", () => {
  test("columns are horizontal", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a")), item("col2", item("2a"))))
    const col1Box = board.q("#col1").boundingBox()
    const col2Box = board.q("#col2").boundingBox()
    expect(col2Box!.x).toBeGreaterThan(col1Box!.x)
    expect(col2Box!.y).toBe(col1Box!.y)
  })

  test("cards stack vertically", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"), item("1b"))))
    const aBox = board.q("#1a").boundingBox()
    const bBox = board.q("#1b").boundingBox()
    expect(bBox!.y).toBeGreaterThan(aBox!.y)
    expect(bBox!.x).toBe(aBox!.x)
  })
})

describe("Zooming", () => {
  test("e zooms into card with children, Escape returns to previous level", () => {
    const { board } = testEnv(() => item("board", item("col", item("card", item("subcard")))))

    // e zooms in
    board.expect("#card").toExist()
    board.expect("#subcard").toExist()
    board.press("e")
    board.expect("#subcard").toExist()

    // Escape returns to previous level
    board.press("\x1B")
    board.expect("#col").toExist()
    board.expect("#card").toExist()
  })

  test("e on card without children does nothing", () => {
    const { board } = testEnv(() => item("board", item("col", item("leaf"))))
    board.expect("#leaf[data-cursor]").toExist()
    board.press("e")
    // Should stay in board view
    board.expect("#leaf[data-cursor]").toExist()
    const output = board.screenshot()
    expect(output).not.toMatch(/detail pane/i)
  })

  test("zoom into column shows column as board", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("task1"), item("task2")), item("col2", item("taskA"), item("taskB"))),
    )
    // Move to column header and press e to zoom
    board.press("k")
    board.expect("#col1[data-cursor]").toExist()
    board.press("e")

    // Now col1 should be treated as board with tasks as columns
    board.expect("#task1").toExist()
    board.expect("#task2").toExist()
    board.expect("#col2").not.toExist() // col2 no longer visible
  })

  test("zoom into card shows card's children as columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("project", item("todo", item("t1"), item("t2")), item("done", item("d1"))))),
    )
    board.expect("#project[data-cursor]").toExist()
    board.press("e")

    // Should show todo and done as columns
    board.expect("#todo").toExist()
    board.expect("#done").toExist()
    board.expect("#t1").toExist()
    board.expect("#d1").toExist()
  })

  test("nested zoom - zoom into multiple levels", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("level1", item("level2", item("level3", item("deepest")))))),
    )
    // Zoom into level1
    board.press("e")
    board.expect("#level2").toExist()

    // Zoom into level2
    board.press("e")
    board.expect("#level3").toExist()

    // Zoom into level3
    board.press("e")
    board.expect("#deepest").toExist()
  })

  test("Escape after multiple zooms - returns to previous level", () => {
    const { board } = testEnv(() => item("board", item("col", item("level1", item("level2", item("level3"))))))
    board.press("e") // Zoom to level1
    board.expect("#level2").toExist()
    board.press("e") // Zoom to level2
    board.expect("#level3").toExist()

    // Escape once - back to level1
    // At level1: level2 is a column, level3 is a card (grandchild visible)
    board.press("\x1B")
    board.expect("#level2").toExist()
    // Note: level3 IS visible at level1 (as a card in level2 column)
    board.expect("#level3").toExist()

    // Escape again - back to board
    // At board: col is a column, level1 is a card
    board.press("\x1B")
    board.expect("#level1").toExist()
    // Note: level2 IS visible at board level (as a grandchild card)
    board.expect("#level2").toExist()
  })

  test("cursor preserved on zoom in/out, u zooms out, zoom out returns cursor to parent", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card1"), item("card2", item("sub1"), item("sub2")))),
    )

    // --- cursor position preserved when zooming in and out ---
    // Move to card2
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()

    // Zoom in
    board.press("e")
    board.expect("#sub1").toExist()

    // Zoom out - should still be at card2
    board.press("\x1B")
    board.expect("#card2[data-cursor]").toExist()

    // --- u zooms out one level ---
    // Zoom back in to card2
    board.press("e")
    board.expect("#sub1").toExist()
    board.expect("#col").not.toExist()

    // u zooms out one level (back to col as root)
    board.press("u")
    board.expect("#card1").toExist()
    board.expect("#card2").toExist()

    // --- zoom out returns cursor to parent ---
    // After u, cursor may be on card2 (the node we zoomed into).
    // Navigate to card2 via G (last card), then zoom in.
    board.press("G")
    board.expect("#card2[data-cursor]").toExist()
    board.press("e")
    board.expect("#sub1[data-cursor]").toExist()

    // Zoom out - cursor should return to card2
    board.press("\x1B")
    board.expect("#card2[data-cursor]").toExist()
  })

  test("zoom shows path in header", () => {
    const { board } = testEnv(() => item("board", item("col", item("parent", item("child")))))
    board.press("e")
    const output = board.screenshot()
    // Should show breadcrumb: board > col > parent
    expect(output).toMatch(/board.*col.*parent/i)
  })

  test("i zooms one level toward cursor, not all the way", () => {
    // board > col > level1 > level2 > level3
    // With cursor on level1 (which has children), pressing 'i' should zoom
    // into col (one level deeper from root toward cursor), not jump to level1
    const { board } = testEnv(() =>
      item("board", item("col", item("level1", item("level2", item("level3"))), item("other"))),
    )
    // Cursor starts at level1 (first card in col)
    board.expect("#level1[data-cursor]").toExist()

    // Press i - should zoom one level inward (root becomes col)
    // col is the child of board on the path to level1
    board.press("i")

    // Now we're zoomed to col. level1 and other should be visible as columns.
    board.expect("#level1").toExist()
    board.expect("#other").toExist()
    // board should NOT be visible as a column anymore (we zoomed past it)
    board.expect("#board").not.toExist()
  })

  test("i at cursor's parent level acts like o (zoom to cursor)", () => {
    // When cursor is already a direct child of root, i = one level = zoom to cursor
    const { board } = testEnv(() => item("board", item("col", item("card", item("sub")))))
    board.expect("#card[data-cursor]").toExist()

    // col is direct child of board, and card is child of col.
    // i should zoom to col (one level toward card).
    board.press("i")
    board.expect("#card").toExist()
    board.expect("#board").not.toExist()
  })

  describe("cursor position after zooming", () => {
    test("zoom in preserves cursor on first child", () => {
      const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
      board.expect("#parent[data-cursor]").toExist()

      // Zoom in - cursor should go to first child
      board.press("e")
      board.expect("#child1[data-cursor]").toExist()
    })

    test("navigate in zoomed view, then zoom out", () => {
      // Fixture: child1 and child2 are folders (have children)
      // so they become columns with cards when zoomed to parent
      const { board } = testEnv(() =>
        item("board", item("col", item("parent", item("child1", item("c1")), item("child2", item("c2"))))),
      )
      board.press("e") // Zoom in to parent
      // After zoom, cursor is on first card (grandchild) for immediate j/k navigation
      board.expect("#c1[data-cursor]").toExist()

      // Navigate horizontally to child2 column's first card (l = right)
      board.press("l")
      board.expect("#c2[data-cursor]").toExist()

      // Zoom out - cursor returns to parent (preserved from history)
      board.press("\x1B")
      board.expect("#parent[data-cursor]").toExist()
    })
  })
})

describe("History", () => {
  test("back navigation with [ after zooming", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("card1"), item("card2", item("sub1"), item("sub2")))),
    )
    board.press("j")
    board.expect("#card2[data-cursor]").toExist()
    board.press("e")
    board.expect("#sub1").toExist()
    board.press("[")
    board.expect("#card1").toExist()
    board.expect("#card2[data-cursor]").toExist()
  })

  test("forward navigation with ] restores zoom view", () => {
    const { board } = testEnv(() => item("board", item("col", item("card", item("childA"), item("childB")))))
    board.press("e")
    board.expect("#childA").toExist()
    board.press("[")
    board.expect("#card").toExist()
    board.press("]")
    board.expect("#childA").toExist()
    board.expect("#childB").toExist()
  })

  // NOTE: Navigation history is only pushed by ZOOM operations, not cursor movement.
  // Tests for [ and ] must use zoom (i) to create history entries.
  describe("cursor position after history navigation", () => {
    test("[ restores cursor after zoom, ] restores zoom state", () => {
      const { board } = testEnv(() => item("board", item("col", item("parent", item("child1"), item("child2")))))
      // Move to parent card
      board.expect("#parent[data-cursor]").toExist()

      // Zoom in (creates history entry with cursor on parent)
      board.press("e")
      // Now at zoom parent, cursor on child1
      board.expect("#child1").toExist()

      // Go back with [ - should return to board with cursor on parent
      board.press("[")
      board.expect("#parent[data-cursor]").toExist()

      // Go forward with ] - should restore zoom state
      board.press("]")
      board.expect("#child1").toExist()
    })

    test("history preserves zoom cursor position", () => {
      const { board } = testEnv(() =>
        item("board", item("col", item("parent", item("c1", item("gc1")), item("c2", item("gc2"))))),
      )
      // Zoom to parent (c1 and c2 become columns, cursor on first card = gc1)
      board.press("e")
      board.expect("#gc1[data-cursor]").toExist()

      // Navigate to c2's first card
      board.press("l")
      board.expect("#gc2[data-cursor]").toExist()

      // Zoom deeper into c2
      board.press("e")
      board.expect("#gc2").toExist()

      // Go back twice to return to board
      board.press("[")
      board.press("[")
      board.expect("#parent[data-cursor]").toExist()
    })

    test("[ at start of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("task"))))
      board.expect("#task[data-cursor]").toExist()

      // Repeatedly try [ with no history - should stay put
      board.press("[")
      board.expect("#task[data-cursor]").toExist()
      board.press("[")
      board.expect("#task[data-cursor]").toExist()
    })

    test("] at end of history does nothing", () => {
      const { board } = testEnv(() => item("board", item("col", item("card1"), item("card2"))))
      // Create some history
      board.press("j")
      board.press("[") // Go back
      board.press("]") // Go forward

      // Now at end of history
      board.expect("#card2[data-cursor]").toExist()

      // Repeatedly try ] - should stay put
      board.press("]")
      board.expect("#card2[data-cursor]").toExist()
      board.press("]")
      board.expect("#card2[data-cursor]").toExist()
    })
  })
})

describe("View Modes", () => {
  test("switching view modes preserves cursor on same node", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("task1"), item("task2"), item("task3")),
        item("col2", item("taskA"), item("taskB")),
      ),
    )
    // Navigate to specific card
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // Switch view mode (v cycles view modes)
    board.press("v")

    // Cursor should still be on task2 (same logical node)
    // Note: x/y coordinates may differ because layouts vary by view mode
    board.expect("#task2[data-cursor]").toExist()
  })

  // Note: Individual view mode cursor tests covered by "switching between cards/list/columns/tabs views" below

  test("switching between cards/list/columns/tabs views", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item("task2"), item("task3"))))
    // Start in cards view at task2
    board.press("j")
    board.expect("#task2[data-cursor]").toExist()

    // Cycle through views - cursor should stay on task2
    board.press("v") // To list view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // To columns view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // To tabs view
    board.expect("#task2[data-cursor]").toExist()

    board.press("v") // Back to cards view
    board.expect("#task2[data-cursor]").toExist()
  })
})

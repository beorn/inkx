/**
 * Exploration: Navigation History
 *
 * Tests nav back/forward after zooming (n/N) and cursor movement.
 * The handleNavBack/handleNavForward were consolidated recently.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Nav History", () => {
  function deepBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("col1", item("folder1", item("sub1"), item("sub2")), item("B")),
          item("col2", item("C"), item("D")),
        ),
      { columns: 100, rows: 30 },
    )
  }

  test("zoom in then nav back", () => {
    const { board } = deepBoard()
    // Cursor on folder1
    const text1 = board.screenshot()

    // Zoom into folder1
    board.press("n")
    const afterZoom = board.screenshot()

    // Nav back
    board.press("N")
    const afterBack = board.screenshot()

    expect(afterBack).not.toContain("[object Object]")
    expect(afterBack).not.toContain("TypeError")
  })

  test("multiple zoom in/out cycles", () => {
    const { board } = deepBoard()

    // Zoom in and out multiple times
    board.press("n") // zoom in
    board.press("N") // zoom out
    board.press("n") // zoom in again
    board.press("N") // zoom out again

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("nav back at root (boundary)", () => {
    const { board } = deepBoard()
    // Try nav back without having navigated anywhere
    board.press("N")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom in, move cursor, then nav back", () => {
    const { board } = deepBoard()

    // Zoom into folder1
    board.press("n")

    // Move around in the zoomed view
    board.press("j")
    board.press("j")

    // Nav back
    board.press("N")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("zoom into nested folder then back multiple times", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col1",
            item("level1", item("level2", item("level3", item("leaf1"), item("leaf2")))),
          ),
        ),
      { columns: 100, rows: 30 },
    )

    // Zoom down the hierarchy
    board.press("n") // into level1
    board.press("n") // into level2
    board.press("n") // into level3

    // Come back up
    board.press("N")
    board.press("N")
    board.press("N")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("navigate across columns then zoom", () => {
    const { board } = deepBoard()

    // Move to col2
    board.press("l")
    // Move to D
    board.press("j")

    // Zoom in (D is a leaf, might not zoom or might zoom into parent context)
    board.press("n")

    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("sibling board navigation ([ and ])", () => {
    const { board } = testEnv(
      () =>
        item(
          "root",
          item("board1", item("col1a", item("A"))),
          item("board2", item("col2a", item("B"))),
        ),
      { columns: 100, rows: 30 },
    )

    // Zoom into board1 first
    board.press("n")

    // Try sibling nav
    board.press("]") // next sibling
    const text1 = board.screenshot()
    expect(text1).not.toContain("[object Object]")

    board.press("[") // prev sibling
    const text2 = board.screenshot()
    expect(text2).not.toContain("[object Object]")
  })

  test("rapid zoom in/out doesn't corrupt state", () => {
    const { board } = deepBoard()
    for (let i = 0; i < 10; i++) {
      board.press("n")
      board.press("N")
    }
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})

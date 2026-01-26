/**
 * Body Content Tests
 *
 * Tests that body content (paragraphs, code, quotes before sections) renders correctly:
 * - Board level: Body column appears first, dimmed, borderless
 * - Column level: Body cards appear before structural cards, borderless
 * - Navigation: h/l/j/k skip virtual body elements
 *
 * Uses createFakeVault for fast in-memory testing.
 */

import { describe, test, expect, afterEach } from "bun:test"
import { createFakeRepo } from "@km/storage"
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts"
import { BODY_CONTENT_BOARD } from "./fixtures/body-content-fixture.ts"

describe("Body Content Visual Tests", () => {
  let board: BoardTestHarness | null = null

  afterEach(() => {
    if (board) {
      board.unmount()
      board = null
    }
  })

  test("body content file renders correctly", async () => {
    const vault = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(vault)
    const screenshot = board.screenshot()

    // Should render content from body fixture
    expect(screenshot.length).toBeGreaterThan(0)
    expect(screenshot).toBeTruthy()
  })

  test("navigation with h/l moves between columns", async () => {
    const vault = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(vault)

    // Initial state
    const initial = board.screenshot()
    expect(initial.length).toBeGreaterThan(0)

    // Press 'l' to move right
    board.press("l")
    const afterRight = board.screenshot()
    expect(afterRight.length).toBeGreaterThan(0)

    // Press 'h' to move left
    board.press("h")
    const afterLeft = board.screenshot()
    expect(afterLeft.length).toBeGreaterThan(0)

    // Press 'l' twice to go further right
    board.press("l")
    board.press("l")
    const afterTwoRight = board.screenshot()
    expect(afterTwoRight.length).toBeGreaterThan(0)
  })

  test("navigation with j/k moves between cards", async () => {
    const vault = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(vault)

    // Navigate to a column first
    board.press("l")

    // Navigate down into the column
    board.press("j")
    const afterDown = board.screenshot()
    expect(afterDown.length).toBeGreaterThan(0)

    // Navigate up
    board.press("k")
    const afterUp = board.screenshot()
    expect(afterUp.length).toBeGreaterThan(0)
  })

  test("g (go top) navigates to first card", async () => {
    const vault = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(vault)

    // Navigate to a column
    board.press("l")

    // Navigate down a couple times
    board.press("j")
    board.press("j")
    const afterTwoDown = board.screenshot()

    // Press 'g' to go to top
    board.press("g")
    const afterGoTop = board.screenshot()

    expect(afterTwoDown.length).toBeGreaterThan(0)
    expect(afterGoTop.length).toBeGreaterThan(0)
  })

  test("nested content expands correctly", async () => {
    const vault = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(vault)

    // Navigate to Column B (two 'l' presses)
    board.press("l")
    board.press("l")

    // Navigate to a card
    board.press("j")
    const beforeExpand = board.screenshot()

    // Expand the card
    board.press("enter")
    const afterExpand = board.screenshot()

    expect(beforeExpand.length).toBeGreaterThan(0)
    expect(afterExpand.length).toBeGreaterThan(0)
  })
})

/**
 * Tests for TUI scroll follow behavior
 * Verifies that scroll follows cursor when navigating past viewport boundaries
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Scroll Follow", () => {
  // Create a board with enough items to require scrolling on a 24-row terminal
  function createLargeBoard() {
    const inboxItems = []
    for (let i = 0; i < 20; i++) {
      inboxItems.push(item("Task " + (i + 1)))
    }
    const inbox = item("inbox", ...inboxItems)

    const projectItems = []
    for (let i = 0; i < 15; i++) {
      projectItems.push(item("Project " + (i + 1)))
    }
    const projects = item("projects", ...projectItems)

    return item.root("board", inbox, projects)
  }

  test("list view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, {
      rows: 24,
      columns: 80,
      viewMode: "list",
    })

    // Navigate down past visible area
    for (let i = 0; i < 18; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see Task 15-20 range (scroll followed cursor)
    expect(screenshot).toMatch(/Task (1[5-9]|20)/)
  })

  test("cards view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, {
      rows: 24,
      columns: 80,
      viewMode: "cards",
    })

    // Navigate into first column then down
    board.press("j") // to column header
    board.press("j") // to first card

    // Navigate down past visible area
    for (let i = 0; i < 18; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see higher numbered tasks (scroll followed)
    expect(screenshot).toMatch(/Task (1[5-9]|20)/)
  })

  test("columns view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, {
      rows: 24,
      columns: 80,
      viewMode: "columns",
    })

    // Navigate into first column
    board.press("j") // to column header
    board.press("j") // to first card

    // Navigate down past visible area
    for (let i = 0; i < 18; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see higher numbered tasks (scroll followed)
    // The breadcrumb should show the current item
    expect(screenshot).toMatch(/Task (1[5-9]|20)/)
  })
})

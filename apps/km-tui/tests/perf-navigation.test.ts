/**
 * Tests for TUI scroll follow behavior
 * Verifies that scroll follows cursor when navigating past viewport boundaries
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Scroll Follow", () => {
  // Create a board with many items to test scrolling
  function createLargeBoard() {
    const inboxItems = []
    for (let i = 0; i < 100; i++) {
      inboxItems.push(item("Task " + (i + 1)))
    }
    const inbox = item("inbox", ...inboxItems)

    const projectItems = []
    for (let i = 0; i < 50; i++) {
      projectItems.push(item("Project " + (i + 1)))
    }
    const projects = item("projects", ...projectItems)

    return item.root("board", inbox, projects)
  }

  test("list view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, { rows: 24, columns: 80 })

    // Switch to list view
    while (!board.screenshot().includes("LIST VIEW")) {
      board.press("v")
    }

    // Navigate down past visible area
    for (let i = 0; i < 28; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see Task 25-30 range (scroll followed cursor)
    expect(screenshot).toMatch(/Task (2[5-9]|30)/)
  })

  test("cards view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, { rows: 24, columns: 80 })

    // Make sure we're in cards view
    while (!board.screenshot().includes("CARDS VIEW")) {
      board.press("v")
    }

    // Navigate into first column then down
    board.press("j") // to column header
    board.press("j") // to first card

    // Navigate down past visible area
    for (let i = 0; i < 30; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see higher numbered tasks (scroll followed)
    expect(screenshot).toMatch(/Task (2[5-9]|3[0-5])/)
  })

  test("columns view scroll follows cursor past bottom", () => {
    const { board } = testEnv(createLargeBoard, { rows: 24, columns: 80 })

    // Switch to columns view
    while (!board.screenshot().includes("COLUMNS VIEW")) {
      board.press("v")
    }

    // Navigate into first column
    board.press("j") // to column header
    board.press("j") // to first card

    // Navigate down past visible area
    for (let i = 0; i < 30; i++) {
      board.press("j")
    }

    const screenshot = board.screenshot()

    // Should see higher numbered tasks (scroll followed)
    // The breadcrumb should show the current item
    expect(screenshot).toMatch(/Task 3[0-5]/)
  })
})

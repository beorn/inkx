/**
 * Tests for Search dialog bugs
 *
 * km-tui.2: [2 appears after double backspace
 * km-tui.3: title/input hidden during loading
 */
import { test, expect, describe } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Search dialog bugs", () => {
  describe("km-tui.2: [2 after backspace", () => {
    test("backspacing to empty shows placeholder, not [2", () => {
      const { board } = testEnv(() => item("board", item("col", item("alpha"), item("beta"))))

      // Open search and type
      board.press("/")
      board.press("a")
      board.press("b")

      // Verify we have "ab" in input
      let output = board.screenshot()
      expect(output).toContain("ab")

      // Backspace twice to empty
      board.press("Backspace")
      board.press("Backspace")

      output = board.screenshot()

      // Should NOT contain [2
      expect(output).not.toContain("[2")

      // Should show placeholder or empty input area
      // The dialog should still be open with "Search" title
      expect(output).toContain("Search")
    })

    test("rapid backspace doesn't leave artifacts", () => {
      const { board } = testEnv(() => item("board", item("col", item("test"))))

      board.press("/")
      board.press("t")
      board.press("e")
      board.press("s")
      board.press("t")

      // Rapid backspace
      board.press("Backspace")
      board.press("Backspace")
      board.press("Backspace")
      board.press("Backspace")

      const output = board.screenshot()

      // Should not have any escape sequence fragments
      expect(output).not.toContain("[2")
      expect(output).not.toContain("[A")
      expect(output).not.toContain("[B")
    })
  })

  describe("km-tui.3: title visibility during loading", () => {
    test("Search title remains visible with results", () => {
      const { board } = testEnv(
        () =>
          item(
            "board",
            item(
              "col",
              item("Task Alpha"),
              item("Task Beta"),
              item("Task Gamma"),
              item("Task Delta"),
              item("Task Epsilon"),
            ),
          ),
        { rows: 20 }, // Smaller terminal
      )

      board.press("/")
      board.press("T")
      board.press("a")

      const output = board.screenshot()

      // Title should always be visible
      expect(output).toContain("Search")

      // Input should be visible (either the typed text or placeholder)
      expect(output).toMatch(/Ta|type to search/)
    })
  })
})

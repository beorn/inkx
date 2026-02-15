/**
 * Body Block Spacing Tests
 *
 * Verifies context-dependent rendering of body blocks (paragraphs, code blocks, quotes):
 * - Cards view: compact (blank lines within blocks collapsed)
 * - Columns view: spaced (one blank line between consecutive body blocks, no borders)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Body block spacing", () => {
  // Helper to create a board with body content (paragraphs before sections)
  function boardWithBodyContent() {
    return item(
      "board",
      item(
        "col1",
        item.paragraph("body paragraph one"),
        item.paragraph("body paragraph two"),
        item("task-a"),
        item("task-b"),
      ),
    )
  }

  describe("cards view", () => {
    test("body blocks have compact content (blank lines collapsed)", () => {
      // Create a body card with internal blank lines
      const nodes = item(
        "board",
        item(
          "col1",
          item.paragraph("line one\n\nline two\n\n\nline three"),
          item("task-a"),
        ),
      )
      const { board } = testEnv(() => nodes)

      const screenshot = board.screenshot()
      expect(screenshot).toContain("line one")
      expect(screenshot).toContain("line two")
      expect(screenshot).toContain("line three")

      // Find the lines inside the card (after the column header separator)
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const lineOneIdx = contentLines.findIndex((l) => l.includes("line one"))
      const lineTwoIdx = contentLines.findIndex((l) => l.includes("line two"))
      const lineThreeIdx = contentLines.findIndex((l) => l.includes("line three"))

      // All three lines should be on consecutive rows (no blank gap between them)
      // because compactContent collapses \n\n → \n
      expect(lineTwoIdx).toBe(lineOneIdx + 1)
      expect(lineThreeIdx).toBe(lineTwoIdx + 1)
    })

    test("body blocks render with borders in cards view", () => {
      const { board } = testEnv(boardWithBodyContent)

      const screenshot = board.screenshot()
      expect(screenshot).toContain("body paragraph one")
      expect(screenshot).toContain("body paragraph two")

      // Body cards should have round border characters (╭ or ╰)
      expect(screenshot).toMatch(/[╭╰]/)
    })
  })

  describe("columns view", () => {
    // TODO: implement inter-block spacing in columns view (km-tui.body-block-spacing)
    test.skip("body blocks have one blank line between them", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()
      expect(screenshot).toContain("body paragraph one")
      expect(screenshot).toContain("body paragraph two")

      // Find the lines after the column header separator
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
      const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))

      // There should be exactly one blank line between body blocks (index diff of 2)
      expect(paraTwoIdx).toBe(paraOneIdx + 2)
      // The line between them should be blank (empty or whitespace only)
      const lineBetween = contentLines[paraOneIdx + 1]!
      expect(lineBetween.trim()).toBe("")
    })

    test("body blocks have no borders in columns view", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()

      // Find the lines after the column header separator
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))

      // No round border characters near body content
      if (paraOneIdx > 0) {
        const lineBefore = contentLines[paraOneIdx - 1]!
        expect(lineBefore).not.toMatch(/[╭╮╰╯]/)
      }
      const lineAfter = contentLines[paraOneIdx + 1]
      if (lineAfter) {
        expect(lineAfter).not.toMatch(/[╭╮╰╯]/)
      }
    })

    // TODO: implement inter-block spacing in columns view (km-tui.body-block-spacing)
    test.skip("body blocks have more spacing than structural items", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
      const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))
      const taskAIdx = contentLines.findIndex((l) => l.includes("task-a"))
      const taskBIdx = contentLines.findIndex((l) => l.includes("task-b"))

      // Body blocks: spacing of 2 (one blank line between them)
      const bodySpacing = paraTwoIdx - paraOneIdx
      // Structural items: spacing of 1 (no blank line between them)
      const structuralSpacing = taskBIdx - taskAIdx

      expect(bodySpacing).toBe(2)
      expect(structuralSpacing).toBe(1)
    })
  })
})

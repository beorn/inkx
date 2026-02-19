/**
 * Test: Column headers show full name — last character must not be truncated.
 *
 * Regression test for km-tui.col-header-trunc: headers like "FAMILY SCHEDULE"
 * were rendered as "FAMILY SCHEDUL" (missing last char).
 *
 * Root cause: Nerdfont icons in Private Use Area (U+E000-U+F8FF) are rendered
 * as 2-cell width by terminals like Ghostty/Kitty when followed by whitespace,
 * but string-width/graphemeWidth reports them as 1 cell. This 1-column mismatch
 * causes all subsequent text to shift right by 1, clipping the last character
 * at the column boundary.
 *
 * Bead: km-tui.col-header-trunc
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { displayWidth, graphemeWidth } from "inkx"

describe("col-header-last-char", () => {
  test("nerdfont PUA folder icon width should account for terminal rendering", () => {
    // The nerdfont folder icon U+F114 is in the Private Use Area.
    // Terminals like Ghostty render PUA chars as 2 cells when followed by whitespace.
    // inkx's graphemeWidth should return 2 for these characters.
    const folderIcon = "\uF114"
    const fileIcon = "\uF0F6"
    const sectionIcon = "\u00A7"  // § - not PUA, always 1

    // PUA characters should be 2-wide to match terminal rendering
    expect(
      graphemeWidth(folderIcon),
      "nerdfont folder icon should be 2-wide (PUA chars render as 2 cells in terminals)",
    ).toBe(2)

    expect(
      graphemeWidth(fileIcon),
      "nerdfont file icon should be 2-wide (PUA chars render as 2 cells in terminals)",
    ).toBe(2)

    // Non-PUA characters stay at 1
    expect(graphemeWidth(sectionIcon), "section sign should be 1-wide").toBe(1)
  })

  test("displayWidth accounts for PUA icon width in header text", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name
    const headerText = `${folderIcon} FAMILY SCHEDULE`

    // With icon as 2-wide: 2 + 1 + 15 = 18
    expect(displayWidth(headerText)).toBe(18)
  })

  test("single column header shows full name", () => {
    const { board } = testEnv(
      () => item.root("board", item("FAMILY SCHEDULE", item("task-a"))),
      { columns: 80, rows: 20 },
    )

    const text = board.screenshot()
    expect(text).toContain("FAMILY SCHEDULE")
  })

  test("two-column board shows full column names", () => {
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item("FAMILY SCHEDULE", item("task-a")),
          item("PORTFOLIO", item("task-b")),
        ),
      { columns: 80, rows: 20 },
    )

    const text = board.screenshot()
    expect(text).toContain("FAMILY SCHEDULE")
    expect(text).toContain("PORTFOLIO")
  })

  test("column header last char not eaten by off-by-one", () => {
    const names = ["SPRINT", "BACKLOG", "SCHEDULE", "PORTFOLIO", "PRODUCTIVITY"]
    for (const name of names) {
      const { board } = testEnv(
        () => item.root("board", item(name, item("task"))),
        { columns: 80, rows: 15 },
      )
      const text = board.screenshot()
      expect(text, `Column "${name}" should be fully visible`).toContain(name)
    }
  })
})

/**
 * Test: Column headers show full name — last character must not be truncated.
 *
 * Regression test for km-tui.col-header-trunc and km-tui.col-trunc2:
 * headers like "FAMILY SCHEDULE" / "FAMILY SPRINT" were rendered as
 * "FAMILY SCHEDUL" / "FAMILY SPRIN" (missing last char).
 *
 * NOTE: The original root cause was a mismatch between terminal rendering
 * (Ghostty renders PUA nerdfont icons as 2-cell) and string-width (reports 1).
 * A blanket PUA=2 fix was attempted but reverted because it broke ALL borders
 * and alignment (most terminals render PUA nerdfont icons as 1-cell).
 *
 * The test fixtures here don't contain PUA icons (testEnv doesn't inject them),
 * so these tests verify that column layout itself doesn't truncate names.
 * The terminal-specific mismatch is tracked separately in km-tui.col-trunc2.
 *
 * Bead: km-tui.col-header-trunc, km-tui.col-trunc2
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { displayWidth, graphemeWidth } from "inkx"

describe("col-header-last-char", () => {
  test("nerdfont PUA icons measured as 1-wide by string-width", () => {
    // PUA nerdfont icons (U+E000-U+F8FF) are measured as 1-cell by string-width.
    // Some terminals (Ghostty, Kitty) render them as 2-cell, but the measurement
    // library treats them as 1-cell. We match string-width's measurement.
    const folderIcon = "\uF114"
    const fileIcon = "\uF0F6"
    const sectionIcon = "\u00A7" // § - not PUA, always 1

    expect(graphemeWidth(folderIcon), "PUA folder icon is 1-wide per string-width").toBe(1)
    expect(graphemeWidth(fileIcon), "PUA file icon is 1-wide per string-width").toBe(1)
    expect(graphemeWidth(sectionIcon), "section sign should be 1-wide").toBe(1)
  })

  test("displayWidth with PUA icon in header text", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name (icon is 1-wide per string-width)
    const headerText = `${folderIcon} FAMILY SCHEDULE`

    // 1 (icon) + 1 (space) + 15 (name) = 17
    expect(displayWidth(headerText)).toBe(17)
  })

  test("single column header shows full name", () => {
    const { board } = testEnv(() => item.root("board", item("FAMILY SCHEDULE", item("task-a"))), {
      columns: 80,
      rows: 20,
    })

    const text = board.screenshot()
    expect(text).toContain("FAMILY SCHEDULE")
  })

  test("two-column board shows full column names", () => {
    const { board } = testEnv(
      () => item.root("board", item("FAMILY SCHEDULE", item("task-a")), item("PORTFOLIO", item("task-b"))),
      { columns: 80, rows: 20 },
    )

    const text = board.screenshot()
    expect(text).toContain("FAMILY SCHEDULE")
    expect(text).toContain("PORTFOLIO")
  })

  test("column header last char not eaten by off-by-one", () => {
    const names = ["SPRINT", "BACKLOG", "SCHEDULE", "PORTFOLIO", "PRODUCTIVITY"]
    for (const name of names) {
      const { board } = testEnv(() => item.root("board", item(name, item("task"))), { columns: 80, rows: 15 })
      const text = board.screenshot()
      expect(text, `Column "${name}" should be fully visible`).toContain(name)
    }
  })

  test("PUA nerdfont icons measured as 1-wide (km-tui.col-trunc2)", () => {
    // Nerdfont icons in the Private Use Area (U+E000-U+F8FF) are measured as
    // 1-cell by string-width. Some terminals render them as 2-cell, creating
    // a mismatch. We match string-width's measurement for consistent layout.
    const folderIcon = "\uF114" //  folder-o (nerdfont)
    const fileIcon = "\uF0F6" //  file-text-o (nerdfont)

    expect(graphemeWidth(folderIcon), "PUA folder icon is 1-wide per string-width").toBe(1)
    expect(graphemeWidth(fileIcon), "PUA file icon is 1-wide per string-width").toBe(1)
  })

  test("displayWidth with PUA nerdfont icon (km-tui.col-trunc2)", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name (icon is 1-wide per string-width)
    const headerText = `${folderIcon} FAMILY SPRINT`

    // 1 (icon) + 1 (space) + 13 (name) = 15
    expect(displayWidth(headerText)).toBe(15)
  })

  test("column header with PUA icon shows full name — no last-char truncation (km-tui.col-trunc2)", () => {
    // Regression: "FAMILY SPRINT" column showed "FAMILY SPRIN" in Ghostty because
    // the PUA folder icon took 2 cells but was measured as 1. The layout engine
    // allocated 1 extra cell to the name, causing the last char to be clipped
    // at the column boundary.
    const { board } = testEnv(
      () => item.root("board", item("FAMILY SPRINT", item("task-a")), item("col2", item("task-b"))),
      { columns: 80, rows: 20 },
    )

    const text = board.screenshot()
    expect(text, "FAMILY SPRINT should not be truncated").toContain("FAMILY SPRINT")
  })

  test("emoji in column name does not truncate last char (km-tui.col-trunc2)", () => {
    // The calendar emoji 📅 is 2 cells wide + PUA folder icon is 2 cells.
    // Total icon area: 2 (PUA icon) + 1 (space) + display name.
    // The name "📅 FAMILY SPRINT" = 2 (emoji) + 1 (space) + 13 (name) = 16.
    // Total header: 2 + 1 + 16 = 19 cells. Must fit in column width.
    const { board } = testEnv(
      () => item.root("board", item("📅 FAMILY SPRINT", item("task-a")), item("col2", item("task-b"))),
      { columns: 80, rows: 20 },
    )

    const text = board.screenshot()
    expect(text, "FAMILY SPRINT should not be truncated").toContain("FAMILY SPRINT")
  })
})

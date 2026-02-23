/**
 * Test: Column headers show full name — last character must not be truncated.
 *
 * Regression test for km-tui.col-header-trunc and km-tui.col-trunc2:
 * headers like "FAMILY SCHEDULE" / "FAMILY SPRINT" were rendered as
 * "FAMILY SCHEDUL" / "FAMILY SPRIN" (missing last char).
 *
 * Root cause: Nerdfont icons in Private Use Area (U+E000-U+F8FF) are rendered
 * as 2-cell width by terminals like Ghostty/Kitty, but string-width reports
 * them as 1 cell. This 1-column mismatch causes all subsequent text to shift
 * right by 1, clipping the last character at the column boundary.
 *
 * Fix: graphemeWidth() in inkx returns 2 for PUA characters, and displayWidth()
 * bypasses the fast-path for strings containing PUA characters.
 *
 * Bead: km-tui.col-header-trunc, km-tui.col-trunc2
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { displayWidth, graphemeWidth } from "inkx"

describe("col-header-last-char", () => {
  test("nerdfont PUA folder icon width in graphemeWidth", () => {
    // The nerdfont folder icon U+F114 is in the Private Use Area.
    // Modern terminals (Ghostty, Kitty, iTerm2) render PUA nerdfont icons as
    // 2-cell width. graphemeWidth must return 2 for accurate layout.
    const folderIcon = "\uF114"
    const fileIcon = "\uF0F6"
    const sectionIcon = "\u00A7" // § - not PUA, always 1

    expect(graphemeWidth(folderIcon), "PUA folder icon should be 2-wide").toBe(2)
    expect(graphemeWidth(fileIcon), "PUA file icon should be 2-wide").toBe(2)
    expect(graphemeWidth(sectionIcon), "section sign should be 1-wide").toBe(1)
  })

  test("displayWidth accounts for PUA icon in header text", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name (icon is 2-wide in terminal)
    const headerText = `${folderIcon} FAMILY SCHEDULE`

    // 2 (icon) + 1 (space) + 15 (name) = 18
    expect(displayWidth(headerText)).toBe(18)
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

  test("PUA nerdfont folder icon measured as 2-wide (km-tui.col-trunc2)", () => {
    // Nerdfont icons in the Private Use Area (U+E000-U+F8FF) are rendered as
    // 2-cell width by modern terminals (Ghostty, Kitty, iTerm2). string-width
    // reports them as 1-cell, causing text after the icon to be positioned 1 cell
    // too far left, truncating the last character at column boundaries.
    const folderIcon = "\uF114" //  folder-o (nerdfont)
    const fileIcon = "\uF0F6" //  file-text-o (nerdfont)

    expect(graphemeWidth(folderIcon), "PUA folder icon should be 2-wide").toBe(2)
    expect(graphemeWidth(fileIcon), "PUA file icon should be 2-wide").toBe(2)
  })

  test("displayWidth accounts for PUA nerdfont icon width (km-tui.col-trunc2)", () => {
    const folderIcon = "\uF114"
    // Header content: icon + space + name (icon is 2-wide in terminal)
    const headerText = `${folderIcon} FAMILY SPRINT`

    // 2 (icon) + 1 (space) + 13 (name) = 16
    expect(displayWidth(headerText)).toBe(16)
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

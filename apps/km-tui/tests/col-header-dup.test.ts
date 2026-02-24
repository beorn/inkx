/**
 * Regression test: km-tui.col-header-dup
 * Column header rendered twice when cursor moves to column level.
 *
 * The column header Box has backgroundColor that transitions:
 * - Card level: undefined (no bg)
 * - Column level: "yellow" (inverse highlight)
 *
 * Tests that incremental rendering correctly handles the
 * backgroundColor transition and doesn't leave stale cells.
 */
import { describe, test, expect } from "vitest"
import { withDiagnostics } from "inkx"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import { stripAnsi } from "inkx/testing"

// Enable style-aware output verification for all tests in this file
process.env.INKX_STRICT_OUTPUT = "1"

describe("col-header-dup: column header style transition", () => {
  test("incremental render matches fresh during card/column navigation", async () => {
    const nodes = item.root(
      "board",
      item("beowa", item("task-a"), item("task-b"), item("task-c")),
      item("bjorn", item("task-d"), item("task-e")),
      item("early-orbit", item("task-f")),
    )
    const repo = createFakeRepo({ nodes })

    const baseDriver = createBoardDriver(repo, "board", {
      columns: 80,
      rows: 24,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
    })

    // Start at first card
    expect(driver.getState().cursor.level).toBe("card")

    // Navigate up — may go to column or board depending on position
    await driver.cmd.up!()

    // If at column level, great — we've triggered bg transition
    // If at board level, go down to column
    const level1 = driver.getState().cursor.level
    if (level1 === "board") {
      await driver.cmd.down!()
    }

    // Navigate through all levels
    await driver.cmd.down!()  // card
    await driver.cmd.down!()  // next card
    await driver.cmd.right!() // next column
    await driver.cmd.up!()    // toward column header
    await driver.cmd.down!()  // back to card
    await driver.cmd.left!()  // back to first column

    // All diagnostics passed — incremental rendering matches fresh render
  })

  test("column header row has no duplicate content", async () => {
    const nodes = item.root(
      "board",
      item("alpha-col", item("task-a"), item("task-b")),
      item("beta-col", item("task-d")),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 80,
      rows: 24,
    })

    const text = stripAnsi(driver.text)
    const lines = text.split("\n")

    // Find the column header line (contains column names but not breadcrumb)
    // Breadcrumb line contains ">" path separator
    const headerLine = lines.find(
      (line) => line.includes("alpha-col") && !line.includes(">"),
    )
    expect(headerLine, "should find column header line").toBeDefined()

    // "alpha-col" should appear exactly once on the header line
    const matches = (headerLine!.match(/alpha-col/g) || []).length
    expect(matches, `"alpha-col" on header line: ${headerLine}`).toBe(1)

    // Navigate to column level (k until column)
    await driver.press("k")
    let level = driver.getState().cursor.level
    if (level !== "column") {
      await driver.press("k")
      level = driver.getState().cursor.level
    }

    const textAfter = stripAnsi(driver.text)
    const linesAfter = textAfter.split("\n")

    // After navigation, "alpha-col" should still appear exactly once per
    // non-breadcrumb line
    for (const line of linesAfter) {
      if (line.includes(">")) continue // skip breadcrumb
      const count = (line.match(/alpha-col/g) || []).length
      expect(count, `"alpha-col" count on line "${line.trimEnd()}"`).toBeLessThanOrEqual(1)
    }
  })
})

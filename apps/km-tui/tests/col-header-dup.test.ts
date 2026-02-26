/**
 * Regression test: km-tui.col-header-dup
 * Column header rendered twice when cursor moves to column level.
 *
 * The column header Box has backgroundColor that transitions:
 * - Card level: undefined (no bg, yellow text)
 * - Column level: km.selectionBg (yellow bg, black text)
 *
 * Tests that incremental rendering correctly handles the
 * backgroundColor transition and doesn't leave stale cells.
 *
 * Root cause: changesToAnsi used CUF (Cursor Forward) to skip unchanged
 * cells on a row, but didn't reset SGR bg first. Some terminals (Ghostty)
 * fill skipped cells with the current bg, causing visual artifacts.
 * Fix: reset SGR before CUF when bg is set (output-phase.ts).
 */
import { describe, test, expect } from "vitest"
import { withDiagnostics } from "inkx"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { testEnv, item } from "./helpers/board-test.ts"
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
    await driver.cmd.down!() // card
    await driver.cmd.down!() // next card
    await driver.cmd.right!() // next column
    await driver.cmd.up!() // toward column header
    await driver.cmd.down!() // back to card
    await driver.cmd.left!() // back to first column

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
    const headerLine = lines.find((line) => line.includes("alpha-col") && !line.includes(">"))
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

  test("card↔column transitions with incremental check (testEnv)", () => {
    // testEnv enables checkIncremental by default, which compares
    // incremental buffer against fresh render after every press()
    const { board } = testEnv(() =>
      item.root(
        "board",
        item("alpha-col", item("task-a"), item("task-b"), item("task-c")),
        item("beta-col", item("task-d"), item("task-e")),
      ),
    )

    // card → column (bg transition: undefined → yellow)
    board.press("k")

    // column → card (bg transition: yellow → undefined)
    board.press("j")

    // card → card (no bg transition)
    board.press("j")

    // card → next column via right
    board.press("l")

    // column header of beta-col
    board.press("k")

    // back to card
    board.press("j")

    // back to alpha-col
    board.press("h")

    // All incremental checks passed — no buffer mismatches
    const text = stripAnsi(board.screenshot())
    const lines = text.split("\n")
    for (const line of lines) {
      if (line.includes(">")) continue
      const alphaCount = (line.match(/alpha-col/g) || []).length
      expect(alphaCount, `"alpha-col" dup on "${line.trimEnd()}"`).toBeLessThanOrEqual(1)
      const betaCount = (line.match(/beta-col/g) || []).length
      expect(betaCount, `"beta-col" dup on "${line.trimEnd()}"`).toBeLessThanOrEqual(1)
    }
  })
})

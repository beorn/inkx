/**
 * Horizontal scroll indicator test
 *
 * Verifies that ◂/▸ indicators appear when columns overflow horizontally.
 * Uses createBoardDriver (full Board component) to test scroll offset logic.
 * HorizontalVirtualList handles scroll offset and overflow detection internally.
 *
 * Bug: km-tui.horiz-overflow
 */

import { describe, test, expect } from "vitest"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"

describe("Horizontal scroll indicators", () => {
  test("shows right scroll indicator when more columns exist to the right", () => {
    const nodes = item.root(
      "board",
      item("col1", item("t1")),
      item("col2", item("t2")),
      item("col3", item("t3")),
      item("col4", item("t4")),
      item("col5", item("t5")),
      item("col6", item("t6")),
    )
    // Width 80 => maxCols = floor(80/35) = 2. 6 columns > 2 => right indicator
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      columns: 80,
      rows: 20,
    })
    // Check DOM for the indicator component
    const rightIndicator = driver.locator('[data-scroll-indicator="right"]')
    expect(rightIndicator.count()).toBe(1)
    // Check that the arrow character appears somewhere
    expect(rightIndicator.textContent()).toContain("▸")
  })

  test("shows ◂ after scrolling right", async () => {
    const nodes = item.root(
      "board",
      item("col1", item("t1")),
      item("col2", item("t2")),
      item("col3", item("t3")),
      item("col4", item("t4")),
      item("col5", item("t5")),
      item("col6", item("t6")),
    )
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      columns: 80,
      rows: 20,
    })

    // Navigate right past visible columns to trigger scroll
    await driver.press("l") // col 1
    await driver.press("l") // col 2 - should trigger scroll
    await driver.press("l") // col 3 - definitely scrolled

    const ansi = driver.ansi
    const text = driver.text
    const hasArrowInAnsi = ansi.includes("◂")
    const hasArrowInText = text.includes("◂")
    expect(hasArrowInAnsi || hasArrowInText).toBe(true)
  })

  test("no indicators when all columns fit", () => {
    const nodes = item.root("board", item("col1", item("t1")), item("col2", item("t2")))
    // Width 80 => maxCols = 2. 2 columns = 2 => no overflow
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board", {
      columns: 80,
      rows: 20,
    })
    const screen = driver.text
    expect(screen).not.toContain("◂")
    expect(screen).not.toContain("▸")
  })
})

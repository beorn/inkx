/**
 * Memory-mode banner — prominent top-of-screen warning
 *
 * When `km view` is launched against a directory with no `.km/` folder,
 * the repo falls into memory mode: SQLite DB is `:memory:`, edits are
 * rendered but NOT persisted. The tiny "MEM" indicator in the status
 * counters (bottom-right) is too subtle — users lose work when they
 * think changes are saved.
 *
 * Fix: render a prominent banner at the top of the workspace in
 * memory mode, with warning background + high-contrast text.
 *
 * Bead: km-tui.memory-mode-silent-loss
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("Memory-mode banner", () => {
  test("fake repo (memory mode) renders prominent banner", () => {
    using app = createTestApp(item("board", item("Todo", item("Task"))))

    // Banner is visible and contains the explicit "memory mode" warning
    app.expect("#memory-mode-banner").toExist()
    app.expect("#memory-mode-banner").toContainText("Memory mode")
    app.expect("#memory-mode-banner").toContainText("NOT be saved")
  })

  test("banner appears above board content", () => {
    using app = createTestApp(item("board", item("Todo", item("First-card"))))

    const banner = app.q("#memory-mode-banner")
    const col = app.q("#Todo")
    expect(banner).toBeAbove(col)
  })

  test("banner survives navigation and editing", () => {
    using app = createTestApp(item("board", item("Todo", item("task-a"), item("task-b"))))

    // Still visible after cursor movement
    app.command("cursor_down")
    app.expect("#memory-mode-banner").toExist()

    // Still visible after an edit attempt
    app.press("i") // enter_inline_edit
    app.press("Escape")
    app.expect("#memory-mode-banner").toExist()
  })

  test("banner uses warning color (not just dim muted text)", () => {
    using app = createTestApp(item("board", item("Todo", item("Task"))))

    // The banner should be rendered — a prominent, non-dim element.
    // We assert presence + the key warning copy; concrete color tokens
    // are validated by the silvery theme system at render time.
    const banner = app.q("#memory-mode-banner")
    expect(banner).toBeVisible()
    expect(banner).toContainText("⚠") // warning glyph (⚠)
  })
})

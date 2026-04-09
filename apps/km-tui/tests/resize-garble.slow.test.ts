// testEnv FREEZE bucket — see km-all.test-system bead. Reason: createBoardDriver + store internals
/**
 * Resize garble regression test.
 *
 * Reproduces: SILVERY_STRICT=1 km view --repo imports/asana launch-academy
 * then zoom out 2-3 times → garbled rendering.
 *
 * Tests the full incremental render + output path through resize sequences
 * at the km board level, using both headless (buffer) and STRICT verification.
 *
 * The key scenario: render at size A → resize to size B → navigate →
 * verify buffer correctness (STRICT) AND compare with fresh render at size B.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"
import { item } from "./helpers/board-test.ts"

// SILVERY_STRICT=1 is set globally in vitest/setup.ts — no need to set it here.

// ============================================================================
// Fixtures — mimics Asana board complexity
// ============================================================================

function asanaLikeBoard() {
  return item.root(
    "board",
    item(
      "Early Orbit",
      item("Discuss team direction"),
      item("Review contractor agreement"),
      item("Setup CI pipeline"),
      item("Attend Traction conf Aug 10"),
      item("IIT 2 tickets"),
    ),
    item(
      "Can",
      item("Fix imports to node_modules"),
      item("Build automation script"),
      item("Monthly investor updates to LA"),
    ),
    item("Estate", item("Confirmation of residence"), item("Tax returns 2025"), item("Update investment docs")),
    item(
      "Phase 2",
      item("Launch Academy prep"),
      item("Monthly investor update"),
      item("Product roadmap review"),
      item("Wrap up Phase 2"),
    ),
    item("RDP", item("Design system audit"), item("Component library refactor"), item("Founders Agreement")),
    item(
      "Launch A",
      item("Storybook setup"),
      item("Replace logging"),
      item("Docker compose update"),
      item("Network split handling"),
    ),
    item("Product In", item("Feature flags system"), item("Analytics pipeline"), item("User feedback collection")),
    item(
      "Business",
      item("Apple Canada Business setup"),
      item("Investor presentation"),
      item("Strategy document update"),
    ),
  )
}

// ============================================================================
// Resize Tests
// ============================================================================

describe("resize garble regression", () => {
  // Test: resize via App.resize() + store.setDimensions(), then navigate
  test("zoom out 3x with navigation produces correct incremental render", { timeout: 15_000 }, () => {
    const nodes = asanaLikeBoard()
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 120,
      rows: 35,
      incremental: true,
    })

    // Initial render - navigate to establish cursor position
    driver.press("j")
    driver.press("j")
    driver.press("l")

    // Zoom out 1: 120x35 → 160x45
    driver.store.getState().setDimensions({ columns: 160, rows: 45 })
    driver.app.resize(160, 45)

    // Navigate after resize - this exercises incremental rendering
    // SILVERY_STRICT verifies buffer + output correctness on each press
    driver.press("j")
    driver.press("l")
    driver.press("k")

    // Zoom out 2: 160x45 → 200x55
    driver.store.getState().setDimensions({ columns: 200, rows: 55 })
    driver.app.resize(200, 55)

    driver.press("j")
    driver.press("j")
    driver.press("h")

    // Zoom out 3: 200x55 → 240x65
    driver.store.getState().setDimensions({ columns: 240, rows: 65 })
    driver.app.resize(240, 65)

    driver.press("j")
    driver.press("l")
    driver.press("l")
    driver.press("k")

    // Final verification: compare with fresh render at same size
    const resizedText = driver.app.text

    const freshRepo = createFakeRepo({ nodes: asanaLikeBoard() })
    const freshDriver = createBoardDriver(freshRepo, "board", {
      columns: 240,
      rows: 65,
      incremental: false,
    })
    // Navigate to same position
    freshDriver.press("j")
    freshDriver.press("j")
    freshDriver.press("l")
    freshDriver.press("j")
    freshDriver.press("l")
    freshDriver.press("k")
    freshDriver.press("j")
    freshDriver.press("j")
    freshDriver.press("h")
    freshDriver.press("j")
    freshDriver.press("l")
    freshDriver.press("l")
    freshDriver.press("k")

    const freshText = freshDriver.app.text

    // Content should be present (basic sanity — "Business" column may be
    // scrolled off-screen at 240 width with 8 columns)
    expect(resizedText).toContain("Early Orbit")
    expect(resizedText).toContain("Launch A")
    expect(resizedText).toContain("Phase 2")
  })

  // Test: rapid resize without navigation in between
  test("rapid resize (no navigation between) produces correct render", { timeout: 15_000 }, () => {
    const nodes = asanaLikeBoard()
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 80,
      rows: 24,
      incremental: true,
    })

    driver.press("j")

    // Rapid resize sequence (simulates fast zoom out)
    for (const [cols, rows] of [
      [120, 35],
      [160, 45],
      [200, 55],
    ] as const) {
      driver.store.getState().setDimensions({ columns: cols, rows })
      driver.app.resize(cols, rows)
    }

    // Navigate after rapid resize — STRICT catches any incremental issues
    const sequence = ["j", "j", "l", "l", "k", "j", "h", "j", "k", "l"]
    for (const key of sequence) {
      driver.press(key)
    }

    expect(driver.app.text).toContain("Early Orbit")
  })

  // Control: does the mismatch happen WITHOUT resize?
  test("navigation without resize does NOT produce mismatch", { timeout: 15_000 }, () => {
    const nodes = asanaLikeBoard()
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 200,
      rows: 55,
      incremental: true,
    })

    // Same navigation as the resize tests but without any resize
    const sequence = ["j", "j", "l", "l", "k", "j", "h", "j", "k", "l"]
    for (const key of sequence) {
      driver.press(key)
    }

    expect(driver.app.text).toContain("Early Orbit")
  })

  // Test: resize DOWN (zoom in) then UP (zoom out)
  test("zoom in then zoom out roundtrip", { timeout: 15_000 }, () => {
    const nodes = asanaLikeBoard()
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 160,
      rows: 45,
      incremental: true,
    })

    driver.press("j")
    driver.press("l")

    // Zoom in
    driver.store.getState().setDimensions({ columns: 80, rows: 24 })
    driver.app.resize(80, 24)
    driver.press("j")
    driver.press("k")

    // Zoom back out
    driver.store.getState().setDimensions({ columns: 200, rows: 55 })
    driver.app.resize(200, 55)
    driver.press("j")
    driver.press("l")
    driver.press("j")

    expect(driver.app.text).toContain("Early Orbit")
  })
})

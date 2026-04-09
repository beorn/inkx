/**
 * P2 Bug: km-mpjzs — TABS view content bleed
 *
 * In TABS view, switching tabs should fully clear old content.
 * The bug showed trailing characters from other tab content bleeding
 * into the active tab (e.g., "Status: Not started ... N s - d o H").
 *
 * Root cause likely related to keys-as-text bug (km-tui.keys-as-text)
 * where navigation keys were captured as text, corrupting content.
 * These tests verify no rendering-level bleed exists.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"

describe("P2: TABS view content bleed from inactive tabs", () => {
  test("breadcrumb updates cleanly when switching tabs", async () => {
    using app = await createTestApp(
      item(
        "board",
        item("Alpha", item("Alpha task one"), item("Alpha task two")),
        item("Beta", item("Beta item one"), item("Beta item two")),
        item("Gamma", item("Gamma entry one"), item("Gamma entry two")),
      ),
      { cols: 120, rows: 25 },
    )

    // Switch to TABS view
    await app.command("cycle_view_mode")
    await app.command("cycle_view_mode")

    // Alpha tab should be active, breadcrumb should show Alpha
    let screen = app.text
    expect(screen).toContain("Alpha")

    // The first line (breadcrumb/top bar) should contain "Alpha" and NOT "Beta" or "Gamma"
    const line0 = screen.split("\n")[0]!
    expect(line0).toContain("Alpha")
    expect(line0).not.toContain("Beta")
    expect(line0).not.toContain("Gamma")

    // Switch to Beta tab
    await app.command("cursor_right")
    screen = app.text
    const line0After = screen.split("\n")[0]!
    // Breadcrumb should now show "Beta" path, NOT fragments from "Alpha"
    expect(line0After, `Top bar after switching to Beta: "${line0After}"`).not.toContain("Alpha")

    // Switch to Gamma tab
    await app.command("cursor_right")
    screen = app.text
    const line0Gamma = screen.split("\n")[0]!
    expect(line0Gamma, `Top bar after switching to Gamma: "${line0Gamma}"`).not.toContain("Alpha")
    expect(line0Gamma, `Top bar after switching to Gamma: "${line0Gamma}"`).not.toContain("Beta")
  })

  test("active tab content has no fragments from other tabs", async () => {
    using app = await createTestApp(
      item(
        "board",
        item("Alpha", item("Alpha task one"), item("Alpha task two")),
        item("Beta", item("Beta item one"), item("Beta item two")),
        item("Gamma", item("Gamma entry one"), item("Gamma entry two")),
      ),
      { cols: 120, rows: 25 },
    )

    await app.command("cycle_view_mode")
    await app.command("cycle_view_mode")

    const screen = app.text
    expect(screen).toContain("Alpha task one")
    expect(screen).toContain("Alpha task two")

    const lines = screen.split("\n")
    const sepIdx = lines.findIndex((line) => /^─+$/.test(line.trim()))
    if (sepIdx >= 0) {
      const contentArea = lines.slice(sepIdx + 1).join("\n")
      expect(contentArea).not.toContain("Beta")
      expect(contentArea).not.toContain("Gamma")
    }
  })

  test("switching from long to short content clears completely", async () => {
    using app = await createTestApp(
      item(
        "board",
        item(
          "TaskNotes",
          item("Status: Not started - depends on HDHP enrollment"),
          item("Health Savings Account provides triple tax advantage"),
          item("Review benefits package with HR department"),
        ),
        item("ref", item("Reference doc")),
      ),
      { cols: 120, rows: 25 },
    )

    await app.command("cycle_view_mode")
    await app.command("cycle_view_mode")

    // First tab (TaskNotes) should show its content
    let screen = app.text
    expect(screen).toContain("HDHP enrollment")

    // Switch to ref tab (much shorter content)
    await app.command("cursor_right")
    screen = app.text
    expect(screen).toContain("Reference doc")

    // No fragments from TaskNotes should remain anywhere
    expect(screen).not.toContain("HDHP")
    expect(screen).not.toContain("enrollment")
    expect(screen).not.toContain("triple tax")
    expect(screen).not.toContain("HR department")
  })

  test("switching tabs cleans content area completely", async () => {
    using app = await createTestApp(
      item("board", item("First", item("First-unique-content-AAA")), item("Second", item("Second-unique-content-BBB"))),
      { cols: 120, rows: 25 },
    )

    await app.command("cycle_view_mode")
    await app.command("cycle_view_mode")

    let screen = app.text
    expect(screen).toContain("First-unique-content-AAA")

    await app.command("cursor_right")
    screen = app.text
    expect(screen).toContain("Second-unique-content-BBB")

    const lines = screen.split("\n")
    const sepIdx = lines.findIndex((line) => /^─+$/.test(line.trim()))
    if (sepIdx >= 0) {
      const contentArea = lines.slice(sepIdx + 1).join("\n")
      expect(contentArea).not.toContain("First-unique-content-AAA")
    }
  })

  test("rapid back-and-forth tab switching has no bleed", async () => {
    using app = await createTestApp(
      item(
        "board",
        item("Alpha", item("Alpha-unique-111")),
        item("Beta", item("Beta-unique-222")),
        item("Gamma", item("Gamma-unique-333")),
      ),
      { cols: 120, rows: 25 },
    )

    await app.command("cycle_view_mode")
    await app.command("cycle_view_mode")

    // Rapid switching: Alpha -> Beta -> Gamma -> Beta -> Alpha -> Beta
    await app.command("cursor_right")
    await app.command("cursor_right")
    await app.command("cursor_left")
    await app.command("cursor_left")
    await app.command("cursor_right")

    const screen = app.text
    expect(screen).toContain("Beta-unique-222")
    expect(screen).not.toContain("Alpha-unique-111")
    expect(screen).not.toContain("Gamma-unique-333")
  })

  test("ANSI replay: view mode cycling produces correct output", async () => {
    const nodes = item(
      "board",
      item("Alpha", item("Alpha task one"), item("Alpha task two"), item("Alpha task three")),
      item("Beta", item("Beta item one"), item("Beta item two"), item("Beta item three")),
      item("Gamma", item("Gamma entry one"), item("Gamma entry two"), item("Gamma entry three")),
    )
    const repo = createFakeRepo({ nodes })

    const baseDriver = createBoardDriver(repo, "board", {
      columns: 120,
      rows: 25,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: false,
      checkLayout: false,
    })

    // Cycle: cards -> columns
    await driver.cmd.cycle_view_mode!()

    // Cycle: columns -> tabs
    await driver.cmd.cycle_view_mode!()

    // Navigate between tabs — back and forth
    await driver.cmd.right!()
    await driver.cmd.right!()
    await driver.cmd.left!()
    await driver.cmd.left!()
    await driver.cmd.right!()

    // All ANSI replay checks passed — output phase is correct
  })

  test("ANSI replay: long-to-short content switch", async () => {
    const nodes = item(
      "board",
      item(
        "TaskNotes",
        item("Status: Not started - depends on HDHP enrollment"),
        item("Health Savings Account provides triple tax advantage"),
        item("Review benefits package with HR department"),
      ),
      item("ref", item("Reference doc")),
    )
    const repo = createFakeRepo({ nodes })

    const baseDriver = createBoardDriver(repo, "board", {
      columns: 120,
      rows: 25,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: false,
      checkLayout: false,
    })

    // Switch to tabs view
    await driver.cmd.cycle_view_mode!()
    await driver.cmd.cycle_view_mode!()

    // Switch from TaskNotes (long) to ref (short) — this is where bleed would occur
    await driver.cmd.right!()

    // Switch back and forth
    await driver.cmd.left!()
    await driver.cmd.right!()
  })
})

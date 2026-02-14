/**
 * Test: Help overlay "/" key should be yellow (not dimmed)
 *
 * This test lives in /tmp/km-explore-tests/ for reference.
 * To run, copy to apps/km-tui/tests/ or run from the km project root.
 *
 * The "/" key for search must render in yellow, not be treated as a dimmed
 * separator. Separators use " / " (space-slash-space), so a bare "/" is
 * not a separator.
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { renderStatic } from "inkx"
import { HelpOverlay } from "../src/views/HelpOverlay.tsx"

describe("HelpOverlay slash key color", () => {
  test("bare '/' key for search is rendered in yellow, not dimmed", async () => {
    const element = React.createElement(HelpOverlay, { width: 80, height: 60 })
    const output = await renderStatic(element, { width: 80 })

    // Find the line containing "Search items"
    const lines = output.split("\n")
    const searchLine = lines.find((l: string) => l.includes("Search items"))
    expect(searchLine).toBeDefined()

    // The "/" key should be yellow (ANSI 38;5;3 = 256-color yellow)
    // It should NOT be dimmed (ANSI 2m = dim)
    // Check that "/" appears after a yellow color code, not after a dim code
    // 256-color yellow: \x1b[...38;5;3...m
    expect(searchLine).toMatch(/38;5;3[^]*?\//)
    // The "/" must NOT be preceded by dim (;2m) without a yellow reset in between
    // Verify the slash itself is in a yellow span, not a dim span
    const slashIdx = searchLine!.indexOf("/")
    const beforeSlash = searchLine!.slice(0, slashIdx)
    // Last color code before "/" should contain yellow (38;5;3), not dim (;2m as last style)
    expect(beforeSlash).toMatch(/38;5;3/)
  })

  test("separator '/' between keys is dimmed", async () => {
    const element = React.createElement(HelpOverlay, { width: 80, height: 60 })
    const output = await renderStatic(element, { width: 80 })

    // Find a line with a separator, e.g., "h / l"
    const lines = output.split("\n")
    const navLine = lines.find((l: string) => l.includes("Move between columns"))
    expect(navLine).toBeDefined()

    // The "/" separator between h and l should be dimmed (ANSI ;2m)
    expect(navLine).toMatch(/;2m[^/]*?\//)
  })
})

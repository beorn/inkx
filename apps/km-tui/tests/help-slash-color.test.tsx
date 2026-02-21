/**
 * Test: Help overlay content and rendering
 *
 * Verifies the help overlay renders correctly with the chord-based
 * keybinding layout, and that "/" keys render in the proper color.
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { renderStatic } from "inkx"
import { HelpOverlay } from "../src/views/HelpOverlay.tsx"

/** Render the help overlay and return stripped lines */
async function renderHelp(opts?: { height?: number; scrollOffset?: number }) {
  const h = opts?.height ?? 60
  const element = React.createElement(HelpOverlay, {
    width: 80,
    height: h,
    scrollOffset: opts?.scrollOffset ?? 0,
  })
  const output = await renderStatic(element, { width: 80, height: h + 10 })
  return output
}

function strip(s: string): string {
  return s.replace(/\x1b\[[^m]*m/g, "")
}

describe("HelpOverlay", () => {
  test("shows chord matrix as first section", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("VERBS x LOCATIONS")
    expect(stripped).toContain("GO (g)")
    expect(stripped).toContain("MOVE (m)")
    expect(stripped).toContain("ADD (a)")
  })

  test("chord matrix contains all location rows", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    for (const loc of ["inbox", "today", "home", "project", "node", "tag", "person"]) {
      expect(stripped).toContain(loc)
    }
  })

  test("shows task prefix section", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("TASK")
    expect(stripped).toContain("tt dialog")
  })

  test("shows navigation section", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("NAVIGATION")
    expect(stripped).toContain("hjkl")
  })

  test("shows editing section", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("EDITING")
    expect(stripped).toContain("edit title")
  })

  test("shows search & dialogs section", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("SEARCH")
    expect(stripped).toContain("omnibox")
  })

  test("bare '/' key for find is rendered in yellow", async () => {
    const output = await renderHelp()
    const lines = output.split("\n")
    const findLine = lines.find((l: string) => strip(l).includes("find"))
    expect(findLine).toBeDefined()
    // The "/" key should be in yellow (ANSI 38;5;3)
    expect(findLine).toMatch(/38;5;3/)
  })

  test("scrolling shifts visible content", async () => {
    // Use a small height so content doesn't all fit (forces scroll)
    const smallHeight = 30

    // At scroll offset 0, VERBS should be visible
    const output0 = await renderHelp({ height: smallHeight, scrollOffset: 0 })
    expect(strip(output0)).toContain("VERBS x LOCATIONS")

    // At a moderate scroll offset, later sections should be visible
    const output15 = await renderHelp({ height: smallHeight, scrollOffset: 15 })
    const stripped15 = strip(output15)
    // VERBS header should be scrolled past
    expect(stripped15).not.toContain("VERBS x LOCATIONS")
    // EDITING section should now be visible
    expect(stripped15).toContain("EDITING")
  })

  test("renders footer with close instructions", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("Esc to close")
  })

  test("small terminal renders fallback", async () => {
    const element = React.createElement(HelpOverlay, { width: 20, height: 5 })
    const output = await renderStatic(element, { width: 20, height: 10 })
    const stripped = strip(output)
    expect(stripped).toContain("Terminal too small")
  })
})

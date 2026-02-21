/**
 * Test: Help overlay content and rendering
 *
 * Verifies the help overlay renders correctly with auto-generated
 * keybinding sections from the command registry, and that key names
 * render in the proper color (yellow).
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { renderStatic } from "inkx"
import { HelpOverlay } from "../src/views/HelpOverlay.tsx"

/** Render the help overlay and return stripped lines */
async function renderHelp(opts?: { height?: number; scrollOffset?: number }) {
  const h = opts?.height ?? 200
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
  test("shows auto-generated section headers from keybinding layers", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    // Sections derived from keybinding layer categories
    expect(stripped).toContain("GLOBAL")
    expect(stripped).toContain("NAVIGATION")
    expect(stripped).toContain("EDITING")
    expect(stripped).toContain("SYSTEM")
  })

  test("shows all expected section categories", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    for (const section of [
      "GLOBAL",
      "NAVIGATION",
      "SELECTION",
      "EDITING",
      "TASK",
      "FOLD & CHORDS",
      "VIEW",
      "HISTORY",
      "SYSTEM",
      "FAVORITES & COLUMNS",
    ]) {
      expect(stripped).toContain(section)
    }
  })

  test("shows task section with task commands", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("TASK")
    // Task commands: toggle done (x), cycle status (X), archive (e), capture (c)
    expect(stripped).toMatch(/[xX]/)
  })

  test("shows navigation section with movement keys", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("NAVIGATION")
    // Navigation keys: j, k, h, l appear as key column entries
    expect(stripped).toContain("j")
    expect(stripped).toContain("k")
  })

  test("shows editing section with edit commands", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("EDITING")
    // Edit commands include descriptions like "Edit node title inline"
    expect(stripped).toMatch(/[Ee]dit/)
  })

  test("shows fold & chords section with chord sequences", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("FOLD & CHORDS")
    // Chord sequences use -> notation (e.g. g->g, m->i, a->#)
    expect(stripped).toContain("->")
  })

  test("bare '/' key for find is rendered in yellow", async () => {
    const output = await renderHelp()
    const lines = output.split("\n")
    // The "/" key is in the System section (tui layer), bound to local_find
    // Description is "Open inline find bar"
    const findLine = lines.find((l: string) => {
      const s = strip(l)
      return s.includes("find") || s.includes("Find")
    })
    expect(findLine).toBeDefined()
    // The "/" key should be in yellow (ANSI 38;5;3)
    expect(findLine).toMatch(/38;5;3/)
  })

  test("scrolling shifts visible content", async () => {
    // Use a small height so content doesn't all fit (forces scroll)
    const smallHeight = 30

    // At scroll offset 0, GLOBAL (first section) should be visible
    const output0 = await renderHelp({ height: smallHeight, scrollOffset: 0 })
    expect(strip(output0)).toContain("GLOBAL")

    // At a large scroll offset, later sections should be visible
    const output40 = await renderHelp({ height: smallHeight, scrollOffset: 40 })
    const stripped40 = strip(output40)
    // GLOBAL header should be scrolled past
    expect(stripped40).not.toContain("GLOBAL")
    // A later section should now be visible (SELECTION or beyond)
    expect(stripped40).toMatch(/SELECTION|EDITING|TASK|FOLD|VIEW|HISTORY|SYSTEM/)
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

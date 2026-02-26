/**
 * Test: Help overlay content and rendering
 *
 * Verifies the help overlay renders correctly with auto-generated
 * keybinding sections from the command registry, verb × location grid,
 * and that key names render in the proper color (yellow).
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { renderStatic, ThemeProvider } from "inkx"
import { createRenderer } from "inkx/testing"
import { HelpOverlay } from "../src/views/HelpOverlay.tsx"
import { defaultKmTheme } from "../src/theme.ts"

/** Render the help overlay using createRenderer for layout feedback (Fill needs content rect) */
function renderHelp(opts?: { width?: number; height?: number; scrollOffset?: number }) {
  const w = opts?.width ?? 100
  const h = opts?.height ?? 200
  const render = createRenderer({ cols: w, rows: h + 10 })
  const element = React.createElement(
    ThemeProvider,
    { theme: defaultKmTheme },
    React.createElement(HelpOverlay, {
      width: w,
      height: h,
      scrollOffset: opts?.scrollOffset ?? 0,
    }),
  )
  return render(element)
}

function strip(s: string): string {
  return s.replace(/\x1b\[[^m]*m/g, "")
}

describe("HelpOverlay", () => {
  test("shows section headers from keybinding layers", () => {
    const app = renderHelp()
    expect(app.text).toContain("NAVIGATION")
    expect(app.text).toContain("EDITING")
    expect(app.text).toContain("SYSTEM")
  })

  test("shows all expected section categories", () => {
    const app = renderHelp()
    for (const section of ["NAVIGATION", "EDITING", "SELECTION", "TASK", "VIEW", "PANES", "SYSTEM"]) {
      expect(app.text).toContain(section)
    }
  })

  test("shows chord grid", () => {
    const app = renderHelp()
    // Chord grid has its own SHORTCUTS section
    expect(app.text).toContain("SHORTCUTS")
    // Column headers (3 verbs visible)
    expect(app.text).toMatch(/go to\s+move\s+add\/link/)
    // Prefix key row with ctrl alternatives
    expect(app.text).toContain("prefix key")
    expect(app.text).toContain("⌃g")
    expect(app.text).toContain("⌃m")
    expect(app.text).toContain("⌃l")
    // Board locations
    expect(app.text).toContain("inbox")
    expect(app.text).toContain("journal")
    expect(app.text).toContain("home (@next)")
    // Target locations (wikilink types)
    expect(app.text).toContain("item")
    expect(app.text).toContain("context")
  })

  test("shows combined entries with dot leaders", () => {
    const app = renderHelp()
    // Combined navigation entries
    expect(app.text).toMatch(/hjkl.*·+.*navigate/)
    // Combined fold entries (slash-separated display: "H/L")
    expect(app.text).toMatch(/H\/L.*·+.*fold\/unfold/)
  })

  test("shows task section with task commands", () => {
    const app = renderHelp()
    expect(app.text).toContain("TASK")
    expect(app.text).toMatch(/x\s*\/\s*X/)
  })

  test("shows editing section with edit commands", () => {
    const app = renderHelp()
    expect(app.text).toContain("EDITING")
    expect(app.text).toMatch(/o\s*\/\s*O/)
  })

  test("shows panes section with v-prefix chords", () => {
    const app = renderHelp()
    expect(app.text).toContain("PANES")
    expect(app.text).toContain("v·s")
    expect(app.text).toContain("v·h/l")
  })

  test("uses macOS key icons", () => {
    const app = renderHelp()
    expect(app.text).toContain("⌃")
    expect(app.text).toContain("⌘")
  })

  test("key labels for find are rendered in helpKey color (yellow)", () => {
    const app = renderHelp()
    const lines = app.ansi.split("\n")
    const findLine = lines.find((l: string) => {
      const s = strip(l)
      return s.includes("find") && s.includes("/")
    })
    expect(findLine).toBeDefined()
    // Yellow ANSI code (38;5;3) — keys use km.helpKey color
    expect(findLine).toMatch(/38;5;3/)
  })

  test("scrolling shifts visible content", () => {
    const smallHeight = 30

    const app0 = renderHelp({ height: smallHeight, scrollOffset: 0 })
    expect(app0.text).toContain("NAVIGATION")

    const app40 = renderHelp({ height: smallHeight, scrollOffset: 40 })
    expect(app40.text).not.toContain("NAVIGATION")
    expect(app40.text).toMatch(/TASK|FOLD|VIEW|PANES|SYSTEM|SHORTCUTS/)
  })

  test("renders footer with close instructions", () => {
    const app = renderHelp()
    expect(app.text).toContain("to close")
  })

  test("small terminal renders fallback", async () => {
    const element = React.createElement(HelpOverlay, { width: 20, height: 5 })
    const output = await renderStatic(element, { width: 20, height: 10 })
    const stripped = strip(output)
    expect(stripped).toContain("Terminal too small")
  })
})

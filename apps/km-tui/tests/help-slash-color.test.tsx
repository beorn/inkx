/**
 * Test: Help overlay content and rendering
 *
 * Verifies the help overlay renders correctly with auto-generated
 * keybinding sections from the command registry, verb × location grid,
 * and that key names render in the proper color (yellow).
 */
import { describe, test, expect } from "vitest"
import React from "react"
import { renderStatic } from "inkx"
import { HelpOverlay } from "../src/views/HelpOverlay.tsx"

/** Render the help overlay and return stripped lines */
async function renderHelp(opts?: { width?: number; height?: number; scrollOffset?: number }) {
  const w = opts?.width ?? 100
  const h = opts?.height ?? 200
  const element = React.createElement(HelpOverlay, {
    width: w,
    height: h,
    scrollOffset: opts?.scrollOffset ?? 0,
  })
  const output = await renderStatic(element, { width: w, height: h + 10 })
  return output
}

function strip(s: string): string {
  return s.replace(/\x1b\[[^m]*m/g, "")
}

describe("HelpOverlay", () => {
  test("shows section headers from keybinding layers", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("NAVIGATION")
    expect(stripped).toContain("EDITING")
    expect(stripped).toContain("SYSTEM")
  })

  test("shows all expected section categories", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    for (const section of [
      "NAVIGATION",
      "EDITING",
      "SELECTION",
      "TASK",
      "FOLD",
      "VIEW",
      "PANES",
      "SYSTEM",
      "QUICK ACCESS",
    ]) {
      expect(stripped).toContain(section)
    }
  })

  test("shows verb × location grid", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("VERBS")
    expect(stripped).toContain("LOCATIONS")
    expect(stripped).toContain("go (g)")
    expect(stripped).toContain("move (m)")
    expect(stripped).toContain("add (a)")
    // Grid rows
    expect(stripped).toContain("inbox")
    expect(stripped).toContain("journal")
    expect(stripped).toContain("home")
  })

  test("shows combined entries with dot leaders", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    // Combined navigation entries
    expect(stripped).toMatch(/hjkl.*\.+.*navigate/)
    // Combined fold entries
    expect(stripped).toMatch(/H\/L.*\.+.*fold\/unfold/)
  })

  test("shows task section with task commands", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("TASK")
    expect(stripped).toMatch(/x\/X/)
  })

  test("shows editing section with edit commands", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("EDITING")
    expect(stripped).toMatch(/o\/O/)
  })

  test("shows panes section with ⌃w chords", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("PANES")
    // Chord prefix shown in combined entries
    expect(stripped).toContain("⌃w")
  })

  test("uses macOS key icons", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    // Ctrl shown as ⌃
    expect(stripped).toContain("⌃")
    // Cmd shown as ⌘
    expect(stripped).toContain("⌘")
  })

  test("bare '/' key for find is rendered in yellow", async () => {
    const output = await renderHelp()
    const lines = output.split("\n")
    const findLine = lines.find((l: string) => {
      const s = strip(l)
      return s.includes("find") && s.includes("/")
    })
    expect(findLine).toBeDefined()
    // Yellow ANSI code (38;5;3)
    expect(findLine).toMatch(/38;5;3/)
  })

  test("scrolling shifts visible content", async () => {
    const smallHeight = 30

    const output0 = await renderHelp({ height: smallHeight, scrollOffset: 0 })
    expect(strip(output0)).toContain("NAVIGATION")

    const output40 = await renderHelp({ height: smallHeight, scrollOffset: 40 })
    const stripped40 = strip(output40)
    expect(stripped40).not.toContain("NAVIGATION")
    expect(stripped40).toMatch(/TASK|FOLD|VIEW|PANES|SYSTEM|VERBS/)
  })

  test("renders footer with close instructions", async () => {
    const output = await renderHelp()
    const stripped = strip(output)
    expect(stripped).toContain("to close")
  })

  test("small terminal renders fallback", async () => {
    const element = React.createElement(HelpOverlay, { width: 20, height: 5 })
    const output = await renderStatic(element, { width: 20, height: 10 })
    const stripped = strip(output)
    expect(stripped).toContain("Terminal too small")
  })
})

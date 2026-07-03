/**
 * Tests for Term.paint() — era2a Phase 2.
 *
 * Verifies that paint() on all three Term variants:
 * 1. Returns ANSI output string (or empty for headless)
 * 2. Updates term.frame with an immutable TextFrame
 * 3. TextFrame has correct dimensions, text, cell access
 */

import { describe, test, expect } from "vitest"
import { createTerm } from "@silvery/ag-term"
import { TerminalBuffer } from "@silvery/ag-term/buffer"

// Conditionally load @silvery/test — may not be available in all environments.
// Top-level `await import` keeps this in the ESM module graph (no require());
// emulator tests skip when it is absent.
let testModule: typeof import("@silvery/test") | null = null
try {
  testModule = await import("@silvery/test")
} catch {
  testModule = null
}
const createTermless = testModule?.createTermless

describe("Term.paint()", () => {
  // Helper: create a buffer with some content
  function makeBuffer(cols: number, rows: number, text: string): TerminalBuffer {
    const buf = new TerminalBuffer(cols, rows)
    for (let i = 0; i < text.length && i < cols; i++) {
      buf.setCell(i, 0, { char: text[i]!, fg: null, bg: null, attrs: {} })
    }
    return buf
  }

  describe("headless term", () => {
    test("paint exists and returns empty string", () => {
      const term = createTerm({ cols: 80, rows: 24 })
      expect(term.paint).toBeDefined()
      const buf = makeBuffer(80, 24, "Hello")
      const output = term.paint!(buf, null)
      expect(output).toBe("")
    })

    test("paint sets frame with correct dimensions", () => {
      const term = createTerm({ cols: 40, rows: 10 })
      expect(term.frame).toBeUndefined()

      const buf = makeBuffer(40, 10, "Test")
      term.paint!(buf, null)

      expect(term.frame).toBeDefined()
      expect(term.frame!.width).toBe(40)
      expect(term.frame!.height).toBe(10)
    })

    test("frame contains painted text", () => {
      const term = createTerm({ cols: 20, rows: 5 })
      const buf = makeBuffer(20, 5, "Hello World")
      term.paint!(buf, null)

      expect(term.frame!.text).toContain("Hello World")
      expect(term.frame!.containsText("Hello")).toBe(true)
    })

    test("frame has cell access", () => {
      const term = createTerm({ cols: 20, rows: 5 })
      const buf = makeBuffer(20, 5, "ABC")
      term.paint!(buf, null)

      const cell = term.frame!.cell(0, 0)
      expect(cell.char).toBe("A")
      const cell2 = term.frame!.cell(1, 0)
      expect(cell2.char).toBe("B")
    })

    test("frame is immutable — does not change when buffer mutates", () => {
      const term = createTerm({ cols: 20, rows: 5 })
      const buf = makeBuffer(20, 5, "Before")
      term.paint!(buf, null)

      const textBefore = term.frame!.text

      // Mutate the buffer
      buf.setCell(0, 0, { char: "X", fg: null, bg: null, attrs: {} })

      // Frame should be unchanged (snapshot was cloned)
      expect(term.frame!.text).toBe(textBefore)
    })

    test("successive paints update frame", () => {
      const term = createTerm({ cols: 20, rows: 5 })
      const buf1 = makeBuffer(20, 5, "First")
      term.paint!(buf1, null)
      expect(term.frame!.containsText("First")).toBe(true)

      const buf2 = makeBuffer(20, 5, "Second")
      term.paint!(buf2, buf1)
      expect(term.frame!.containsText("Second")).toBe(true)
      expect(term.frame!.containsText("First")).toBe(false)
    })

    test("frame lines are accessible", () => {
      const term = createTerm({ cols: 10, rows: 3 })
      const buf = makeBuffer(10, 3, "Hi")
      term.paint!(buf, null)

      expect(term.frame!.lines.length).toBeGreaterThanOrEqual(1)
      expect(term.frame!.lines[0]).toContain("Hi")
    })
  })

  describe("node term", () => {
    test("paint exists and returns ANSI string", () => {
      const term = createTerm()
      expect(term.paint).toBeDefined()

      const buf = makeBuffer(80, 24, "Hello")
      const output = term.paint!(buf, null)

      // Fresh render should produce some output (ANSI escape sequences + content)
      expect(typeof output).toBe("string")
      expect(output.length).toBeGreaterThan(0)
    })

    test("paint sets frame", () => {
      const term = createTerm()
      const buf = makeBuffer(80, 24, "Test")
      term.paint!(buf, null)

      expect(term.frame).toBeDefined()
      expect(term.frame!.width).toBe(80)
      expect(term.frame!.height).toBe(24)
      expect(term.frame!.containsText("Test")).toBe(true)
    })

    test("incremental paint produces smaller output", () => {
      const term = createTerm()
      const buf1 = makeBuffer(80, 24, "Hello")
      const fresh = term.paint!(buf1, null)

      // Change one character
      const buf2 = makeBuffer(80, 24, "Jello")
      const incremental = term.paint!(buf2, buf1)

      // Incremental should be smaller than fresh
      expect(incremental.length).toBeLessThan(fresh.length)
    })
  })

  describe("emulator term (termless)", () => {
    test.skipIf(!createTermless)("paint exists and returns ANSI string", () => {
      using term = createTermless!({ cols: 40, rows: 10 })
      expect(term.paint).toBeDefined()

      const buf = makeBuffer(40, 10, "Hello")
      const output = term.paint!(buf, null)

      expect(typeof output).toBe("string")
      expect(output.length).toBeGreaterThan(0)
    })

    test.skipIf(!createTermless)("paint updates frame", () => {
      using term = createTermless!({ cols: 40, rows: 10 })
      const buf = makeBuffer(40, 10, "Emulated")
      term.paint!(buf, null)

      expect(term.frame).toBeDefined()
      expect(term.frame!.width).toBe(40)
      expect(term.frame!.height).toBe(10)
      expect(term.frame!.containsText("Emulated")).toBe(true)
    })

    test.skipIf(!createTermless)("paint feeds emulator (screen updates)", () => {
      using term = createTermless!({ cols: 40, rows: 10 })
      const buf = makeBuffer(40, 10, "Visible")
      term.paint!(buf, null)

      // The emulator's screen should show the content (fed via ANSI)
      expect(term.screen?.getText()).toContain("Visible")
    })
  })
})

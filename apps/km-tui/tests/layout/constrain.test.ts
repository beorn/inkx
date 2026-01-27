/**
 * Tests for text constraining (Layer 2)
 */

import { describe, it, expect } from "vitest"
import { constrainText, displayLength } from "@beorn/tui-measure"

describe("constrainText", () => {
  it("returns single line for short text", () => {
    const result = constrainText("hello", 20, 5)
    expect(result.lines).toEqual(["hello"])
    expect(result.truncated).toBe(false)
  })

  it("wraps text to width", () => {
    const result = constrainText("hello world", 6, 5)
    expect(result.lines).toEqual(["hello", "world"])
    expect(result.truncated).toBe(false)
  })

  it("limits to maxLines", () => {
    const result = constrainText("one two three four five", 5, 2)
    expect(result.lines.length).toBe(2)
    expect(result.truncated).toBe(true)
  })

  it("sets truncated=true when content exceeds maxLines", () => {
    const result = constrainText("line1\nline2\nline3", 20, 2)
    expect(result.truncated).toBe(true)
    expect(result.lines.length).toBe(2)
  })

  it("handles single line that fits", () => {
    const result = constrainText("short", 20, 1)
    expect(result.lines).toEqual(["short"])
    expect(result.truncated).toBe(false)
  })

  it("pads lines when pad=true", () => {
    const result = constrainText("hi", 10, 2, true)
    expect(result.lines[0]).toBe("hi        ")
    expect(displayLength(result.lines[0]!)).toBe(10)
  })

  it("does not pad when pad=false (default)", () => {
    const result = constrainText("hi", 10, 2)
    expect(result.lines[0]).toBe("hi")
  })

  it("handles empty input", () => {
    const result = constrainText("", 10, 2)
    expect(result.lines).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it("handles ANSI-styled text correctly", () => {
    // ANSI codes should not count towards display length
    const styled = "\x1b[31mred\x1b[0m text" // "red text" with red styling
    const result = constrainText(styled, 10, 1)
    // Should fit in one line since display length is 8 ("red text")
    expect(result.lines.length).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it("wraps ANSI-styled text at correct display width", () => {
    const styled = "\x1b[1mhello\x1b[0m \x1b[31mworld\x1b[0m" // "hello world" styled
    const result = constrainText(styled, 6, 5)
    // Should wrap between words at display width 6
    expect(result.lines.length).toBe(2)
    expect(result.truncated).toBe(false)
  })
})

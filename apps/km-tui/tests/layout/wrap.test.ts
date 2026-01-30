/**
 * Tests for text wrapping (Layer 2)
 *
 * Note: inkx's wrapText behavior:
 * - Returns [''] for empty input (preserves the input as a single line)
 * - Preserves trailing spaces on wrapped lines
 */

import { describe, it, expect } from "vitest"
import { wrapText } from "inkx"

describe("wrapText", () => {
  it("returns single empty line for empty input", () => {
    // inkx returns [''] to represent an empty line (consistent behavior)
    expect(wrapText("", 10)).toEqual([""])
  })

  it("returns single line if text fits", () => {
    expect(wrapText("hello", 10)).toEqual(["hello"])
  })

  it("wraps at word boundaries", () => {
    const result = wrapText("hello world", 6)
    // inkx preserves the trailing space on wrapped lines
    expect(result).toEqual(["hello ", "world"])
  })

  it("wraps multiple words", () => {
    const result = wrapText("one two three four", 10)
    // inkx preserves trailing spaces
    expect(result).toEqual(["one two ", "three four"])
  })

  it("handles very long words by breaking mid-word", () => {
    const result = wrapText("superlongword", 5)
    // Should break the word at width
    expect(result.length).toBeGreaterThan(1)
    expect(result[0]?.length).toBeLessThanOrEqual(5)
  })

  it("preserves newlines in input", () => {
    const result = wrapText("line1\nline2", 20)
    expect(result).toEqual(["line1", "line2"])
  })

  it("wraps each line independently", () => {
    const result = wrapText("short\nthis is a longer line", 10)
    expect(result[0]).toBe("short")
    expect(result.length).toBeGreaterThan(2)
  })

  it("handles width of 1", () => {
    const result = wrapText("ab", 1)
    expect(result.length).toBe(2)
  })

  it("wraps at word boundaries respecting width", () => {
    const text = "Edge Cases (wiki links + text)"

    // At width 30, fits on one line
    const result30 = wrapText(text, 30)
    expect(result30).toEqual(["Edge Cases (wiki links + text)"])

    // At width 25, wraps at last space before limit
    // inkx preserves the trailing space
    const result25 = wrapText(text, 25)
    expect(result25.length).toBe(2)
    expect(result25[0]).toBe("Edge Cases (wiki links + ")
    expect(result25[1]).toBe("text)")

    // At width 20, wraps earlier
    const result20 = wrapText(text, 20)
    expect(result20.length).toBe(2)
    expect(result20[0]).toBe("Edge Cases (wiki ")
    expect(result20[1]).toBe("links + text)")
  })
})

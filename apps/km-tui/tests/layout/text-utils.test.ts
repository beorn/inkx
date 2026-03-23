/**
 * Tests for silvery text utilities: wrap, truncate, pad, constrain (Layer 2)
 *
 * Consolidated from truncate.test.ts, constrain.test.ts, wrap.test.ts.
 *
 * Note: silvery's wrapText behavior:
 * - Returns [''] for empty input (preserves the input as a single line)
 * - Preserves trailing spaces on wrapped lines
 * - Uses graphemer for grapheme segmentation (ANSI sequences may not be
 *   handled correctly in wrapping)
 */

import { describe, it, expect } from "vitest"
import { wrapText, truncateText, padText, constrainText, displayWidth as displayLength } from "@silvery/ag-react"

// =============================================================================
// wrapText
// =============================================================================

describe("wrapText", () => {
  it("returns single empty line for empty input", () => {
    // silvery returns [''] to represent an empty line (consistent behavior)
    expect(wrapText("", 10)).toEqual([""])
  })

  it("returns single line if text fits", () => {
    expect(wrapText("hello", 10)).toEqual(["hello"])
  })

  it("wraps at word boundaries", () => {
    const result = wrapText("hello world", 6)
    // silvery preserves the trailing space on wrapped lines
    expect(result).toEqual(["hello ", "world"])
  })

  it("wraps multiple words", () => {
    const result = wrapText("one two three four", 10)
    // silvery preserves trailing spaces
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
    // silvery preserves the trailing space
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

// =============================================================================
// truncateText
// =============================================================================

describe("truncateText", () => {
  it("returns unchanged if text fits", () => {
    expect(truncateText("hello", 10)).toBe("hello")
  })

  it("adds ellipsis when truncating", () => {
    const result = truncateText("hello world", 6)
    expect(result).toContain("…")
    expect(displayLength(result)).toBeLessThanOrEqual(6)
  })

  it("truncates exactly to width", () => {
    const result = truncateText("hello world", 8)
    expect(displayLength(result)).toBeLessThanOrEqual(8)
  })

  it("handles very short width", () => {
    const result = truncateText("hello", 2)
    expect(displayLength(result)).toBeLessThanOrEqual(2)
    expect(result).toContain("…")
  })

  it("handles width of 1", () => {
    const result = truncateText("hello", 1)
    expect(displayLength(result)).toBeLessThanOrEqual(1)
  })

  it("handles empty string", () => {
    expect(truncateText("", 10)).toBe("")
  })
})

// =============================================================================
// padText
// =============================================================================

describe("padText", () => {
  it("pads short text to width", () => {
    const result = padText("hi", 5)
    expect(result).toBe("hi   ")
    expect(result.length).toBe(5)
  })

  it("does not pad if already at width", () => {
    expect(padText("hello", 5)).toBe("hello")
  })

  it("does not pad if longer than width", () => {
    expect(padText("hello world", 5)).toBe("hello world")
  })

  it("handles empty string", () => {
    const result = padText("", 5)
    expect(result).toBe("     ")
  })

  it("handles width of 0", () => {
    expect(padText("hi", 0)).toBe("hi")
  })
})

// =============================================================================
// constrainText
// =============================================================================

describe("constrainText", () => {
  it("returns single line for short text", () => {
    const result = constrainText("hello", 20, 5)
    expect(result.lines).toEqual(["hello"])
    expect(result.truncated).toBe(false)
  })

  it("wraps text to width", () => {
    const result = constrainText("hello world", 6, 5)
    // silvery preserves trailing spaces
    expect(result.lines).toEqual(["hello ", "world"])
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
    // silvery returns [''] for empty input (represents an empty line)
    expect(result.lines).toEqual([""])
    expect(result.truncated).toBe(false)
  })
})

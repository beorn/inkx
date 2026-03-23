/**
 * Tests for rich text rendering (Layer 1)
 */

import { describe, it, expect } from "vitest"
import { createTerm } from "@silvery/ag-react"
import { displayLength, stripAnsi } from "../../src/text/rich.ts"
import { parseToPlainText } from "../../src/text/inline-parser.ts"

// Create a term with forced color for testing
const term = createTerm({ color: "truecolor" })
const style = term

// ============================================================================
// ANSI Utilities
// ============================================================================

describe("stripAnsi", () => {
  it("strips simple ANSI escape codes", () => {
    const text = "\x1b[31mred\x1b[0m"
    expect(stripAnsi(text)).toBe("red")
  })

  it("strips complex ANSI escape codes with multiple params", () => {
    const text = "\x1b[1;31;4mstyle\x1b[0m"
    expect(stripAnsi(text)).toBe("style")
  })
})

describe("displayLength", () => {
  it("returns length of plain text", () => {
    expect(displayLength("hello")).toBe(5)
  })

  it("excludes ANSI escape codes from count", () => {
    const styled = style.red("hello")
    expect(displayLength(styled)).toBe(5)
  })

  it("handles multiple ANSI codes", () => {
    const styled = style.red("a") + style.blue("b") + style.green("c")
    expect(displayLength(styled)).toBe(3)
  })

  it("handles nested styles", () => {
    const styled = style.bold.red("bold red")
    expect(displayLength(styled)).toBe(8)
  })

  it("handles empty string", () => {
    expect(displayLength("")).toBe(0)
  })

  it("handles string with only ANSI codes", () => {
    expect(displayLength("\x1b[31m\x1b[0m")).toBe(0)
  })
})

describe("stripAnsi", () => {
  it("removes all ANSI escape codes", () => {
    const styled = style.red("hello")
    expect(stripAnsi(styled)).toBe("hello")
  })

  it("preserves plain text", () => {
    expect(stripAnsi("hello world")).toBe("hello world")
  })

  it("handles multiple styles", () => {
    const styled = style.red("a") + " " + style.blue("b")
    expect(stripAnsi(styled)).toBe("a b")
  })

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("")
  })
})

// ============================================================================
// parseToPlainText (replacement for renderPlain)
// ============================================================================

describe("parseToPlainText", () => {
  const cases: Array<[string, string, string]> = [
    ["wiki link brackets", "See [[note]]", "See note"],
    ["wiki link alias", "See [[path|alias]]", "See alias"],
    ["plain text", "hello world", "hello world"],
    ["empty string", "", ""],
    ["markdown links", "Click [Google](https://google.com)", "Click Google"],
    ["multiple markdown links", "[one](url1) and [two](url2)", "one and two"],
    ["bold", "**bold** text", "bold text"],
    ["italic", "*italic* text", "italic text"],
    ["code", "Use `code` here", "Use code here"],
    ["strikethrough", "~~deleted~~ text", "deleted text"],
  ]

  for (const [label, input, expected] of cases) {
    it(`${label}: '${input}' → '${expected}'`, () => {
      expect(parseToPlainText(input)).toBe(expected)
    })
  }

  it("does not add ANSI codes", () => {
    const result = parseToPlainText("**bold** and [[link]]")
    expect(result).toBe(stripAnsi(result))
  })
})

/**
 * Tests for pretty URL rendering in the text pipeline.
 *
 * Bare URLs are prettified: protocol + www stripped, styled with underline + dim
 * in rich mode, and wrapped with OSC 8 hyperlinks for clickability.
 */

import { describe, it, expect } from "vitest"
import { stripAnsi } from "inkx"
import { renderRich, renderPlain } from "../../src/text/rich.ts"
import { prettifyUrl } from "../../src/text/text-pipeline.ts"
import { testEnv, item } from "../helpers/board-test.ts"

// =============================================================================
// prettifyUrl (unit)
// =============================================================================

describe("prettifyUrl", () => {
  const cases: Array<[string, string]> = [
    // Protocol stripping
    ["https://example.com", "example.com"],
    ["http://example.com", "example.com"],
    ["https://example.com/path", "example.com/path"],
    ["http://example.com/path/to/page", "example.com/path/to/page"],

    // www stripping
    ["https://www.example.com", "example.com"],
    ["http://www.example.com", "example.com"],
    ["https://www.example.com/path", "example.com/path"],

    // Trailing slash on bare domain stripped
    ["https://example.com/", "example.com"],
    ["https://www.example.com/", "example.com"],

    // Trailing slash on paths preserved
    ["https://example.com/path/", "example.com/path/"],

    // Query strings and fragments preserved
    ["https://example.com/search?q=test", "example.com/search?q=test"],
    ["https://example.com/page#section", "example.com/page#section"],
    ["https://example.com/path?q=1&r=2#frag", "example.com/path?q=1&r=2#frag"],

    // Subdomains preserved (only www is stripped)
    ["https://docs.example.com", "docs.example.com"],
    ["https://api.example.com/v1", "api.example.com/v1"],

    // Complex real-world URLs
    ["https://github.com/user/repo/issues/123", "github.com/user/repo/issues/123"],
    ["https://www.notion.so/workspace/page-id", "notion.so/workspace/page-id"],
  ]

  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      expect(prettifyUrl(input)).toBe(expected)
    })
  }
})

// =============================================================================
// Rich mode: bare URLs styled
// =============================================================================

describe("renderRich: bare URLs", () => {
  it("prettifies a bare https URL", () => {
    const result = renderRich("Visit https://example.com for info")
    const plain = stripAnsi(result)
    expect(plain).toBe("Visit example.com for info")
    // Should not contain protocol
    expect(plain).not.toContain("https://")
  })

  it("prettifies a bare http URL", () => {
    const result = renderRich("See http://example.com/page")
    const plain = stripAnsi(result)
    expect(plain).toBe("See example.com/page")
    expect(plain).not.toContain("http://")
  })

  it("strips www prefix", () => {
    const result = renderRich("Go to https://www.example.com")
    const plain = stripAnsi(result)
    expect(plain).toBe("Go to example.com")
    expect(plain).not.toContain("www.")
  })

  it("applies underline styling", () => {
    const result = renderRich("Visit https://example.com here")
    // Should have underline ANSI code
    expect(result).toContain("\x1b[4m") // underline
  })

  it("applies dim styling", () => {
    const result = renderRich("Visit https://example.com here")
    // Should have dim ANSI code
    expect(result).toContain("\x1b[2m") // dim
  })

  it("handles multiple URLs in same text", () => {
    const result = renderRich("See https://one.com and https://two.com")
    const plain = stripAnsi(result)
    expect(plain).toBe("See one.com and two.com")
  })

  it("preserves URL with path and query", () => {
    const result = renderRich("Link: https://example.com/path?q=test")
    const plain = stripAnsi(result)
    expect(plain).toBe("Link: example.com/path?q=test")
  })

  it("does not double-process markdown link URLs", () => {
    // Markdown links [text](url) should show text only, not prettify the URL
    const result = renderRich("Click [Google](https://google.com) here")
    const plain = stripAnsi(result)
    expect(plain).toBe("Click Google here")
    // Should not contain the prettified URL
    expect(plain).not.toContain("google.com")
  })

  it("handles URL at start of text", () => {
    const result = renderRich("https://example.com is great")
    const plain = stripAnsi(result)
    expect(plain).toBe("example.com is great")
  })

  it("handles URL at end of text", () => {
    const result = renderRich("Visit https://example.com")
    const plain = stripAnsi(result)
    expect(plain).toBe("Visit example.com")
  })

  it("handles URL as only content", () => {
    const result = renderRich("https://example.com/path")
    const plain = stripAnsi(result)
    expect(plain).toBe("example.com/path")
  })

  it("wraps URL in OSC 8 hyperlink", () => {
    const result = renderRich("Visit https://example.com/page here")
    // OSC 8 hyperlink format: \x1b]8;;url\x1b\\ text \x1b]8;;\x1b\\
    expect(result).toContain("\x1b]8;;https://example.com/page\x1b\\")
    expect(result).toContain("\x1b]8;;\x1b\\") // link end
  })

  it("does not interfere with wiki links", () => {
    const result = renderRich("See [[note]] and https://example.com")
    const plain = stripAnsi(result)
    expect(plain).toBe("See note and example.com")
  })

  it("handles URL followed by period (sentence ending)", () => {
    const result = renderRich("Visit https://example.com.")
    const plain = stripAnsi(result)
    // Period should not be part of the URL
    expect(plain).toBe("Visit example.com.")
  })

  it("handles URL followed by comma", () => {
    const result = renderRich("See https://example.com, then continue")
    const plain = stripAnsi(result)
    expect(plain).toBe("See example.com, then continue")
  })
})

// =============================================================================
// Plain mode: bare URLs prettified (no ANSI)
// =============================================================================

describe("renderPlain: bare URLs", () => {
  const cases: Array<[string, string, string]> = [
    ["bare https URL", "Visit https://example.com", "Visit example.com"],
    ["bare http URL", "See http://example.com/page", "See example.com/page"],
    ["www stripped", "Go to https://www.example.com", "Go to example.com"],
    ["multiple URLs", "https://a.com and https://b.com", "a.com and b.com"],
    ["URL with path", "https://example.com/path/page", "example.com/path/page"],
    ["markdown link not affected", "Click [text](https://example.com)", "Click text"],
    ["URL at start", "https://example.com is great", "example.com is great"],
    ["URL only", "https://example.com/path", "example.com/path"],
  ]

  for (const [label, input, expected] of cases) {
    it(`${label}: '${input}' -> '${expected}'`, () => {
      expect(renderPlain(input)).toBe(expected)
    })
  }

  it("no ANSI codes in plain mode", () => {
    const result = renderPlain("Visit https://example.com")
    expect(result).toBe(stripAnsi(result))
  })
})

// =============================================================================
// Board-level test: URL in card content
// =============================================================================

describe("board: URL prettification in cards", () => {
  it("card shows prettified URL (no protocol)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Check https://www.example.com/docs"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("example.com/docs")
    expect(text).not.toContain("https://")
    expect(text).not.toContain("www.")
  })

  it("card with multiple URLs shows all prettified", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("See https://a.com and http://b.com/path"))),
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("a.com")
    expect(text).toContain("b.com/path")
    expect(text).not.toContain("https://")
    expect(text).not.toContain("http://")
  })

  it("markdown link in card still shows link text only", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Click [Google](https://google.com)"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Google")
    expect(text).not.toContain("google.com")
  })
})

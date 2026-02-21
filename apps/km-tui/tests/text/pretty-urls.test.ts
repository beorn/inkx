/**
 * Tests for pretty URL rendering.
 *
 * Unit tests for prettifyUrl() and board-level integration tests
 * verifying URLs are prettified in the TUI.
 */

import { describe, it, expect } from "vitest"
import { prettifyUrl } from "../../src/text/text-pipeline.ts"
import { parseToPlainText } from "../../src/text/inline-parser.ts"
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
// parseToPlainText: bare URLs prettified
// =============================================================================

describe("parseToPlainText: bare URLs", () => {
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
      expect(parseToPlainText(input)).toBe(expected)
    })
  }
})

// =============================================================================
// Board-level test: URL in card content
// =============================================================================

describe("board: URL prettification in cards", () => {
  it("card shows prettified URL (no protocol)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Check https://www.example.com/docs"))), {
      rows: 20,
      columns: 60,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("example.com/docs")
    expect(text).not.toContain("https://")
    expect(text).not.toContain("www.")
  })

  it("card with multiple URLs shows all prettified", () => {
    const { board } = testEnv(() => item("board", item("col1", item("See https://a.com and http://b.com/path"))), {
      rows: 20,
      columns: 80,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("a.com")
    expect(text).toContain("b.com/path")
    expect(text).not.toContain("https://")
    expect(text).not.toContain("http://")
  })

  it("markdown link in card still shows link text only", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Click [Google](https://google.com)"))), {
      rows: 20,
      columns: 60,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Google")
    expect(text).not.toContain("google.com")
  })

  it("card body with URL does not show raw escape sequences when truncated", () => {
    // Use a narrow terminal so the URL text gets truncated by wrap="truncate"
    const { board } = testEnv(
      () =>
        item("board", item("col1", item("Task with https://www.example.com/very/long/path/that/will/be/truncated"))),
      { rows: 20, columns: 40 },
    )

    // Check the rendered buffer for escape sequence artifacts
    const screenText = board.screen.text
    // OSC 8 escape sequences should never appear as visible text in the buffer.
    expect(screenText).not.toContain("]8;;")
    expect(screenText).not.toContain("\x1b]")
    expect(screenText).not.toContain("\x1b\\")
    // The prettified URL should be visible (or truncated with ellipsis), not raw escape codes
    expect(screenText).not.toContain("https://")
    expect(screenText).not.toContain("www.")
  })

  it("card body with URL in child node does not show escape sequences", () => {
    // A card with a child that has a URL — child gets wrap="truncate" as isCardChild
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.file("Parent", item("Child text with https://www.example.com/some/very/long/path/here"))),
        ),
      { rows: 20, columns: 40 },
    )

    const screenText = board.screen.text
    expect(screenText).not.toContain("]8;;")
    expect(screenText).not.toContain("\x1b]")
    expect(screenText).not.toContain("\x1b\\")
  })
})

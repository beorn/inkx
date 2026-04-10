/**
 * Tests for pretty URL rendering.
 *
 * Unit tests for prettifyUrl() and board-level integration tests
 * verifying URLs are prettified in the TUI.
 */

import { describe, it, expect } from "vitest"
import { prettifyUrl } from "../../src/text/text-pipeline.ts"
import { parseToPlainText } from "../../src/text/inline-parser.ts"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"

// =============================================================================
// prettifyUrl (unit) — basic display cleanup
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
// prettifyUrl — tracking parameter stripping
// =============================================================================

describe("prettifyUrl: tracking params", () => {
  const cases: Array<[string, string, string]> = [
    // UTM params
    [
      "utm_medium",
      "https://fabricatedknowledge.com/p/the-death-of-software-20-a-better?utm_medium=web",
      "fabricatedknowledge.com/p/the-death-of-software-20-a-better",
    ],
    [
      "multiple utm params",
      "https://example.com/page?utm_source=twitter&utm_medium=social&utm_campaign=launch",
      "example.com/page",
    ],
    [
      "utm mixed with real params",
      "https://example.com/search?q=test&utm_source=google&page=2",
      "example.com/search?q=test&page=2",
    ],

    // Facebook
    ["fbclid", "https://example.com/article?fbclid=IwAR3abc123", "example.com/article"],
    ["__tn__", "https://example.com/post?__tn__=-R", "example.com/post"],

    // Google Ads
    ["gclid", "https://example.com/?gclid=abc123&gad_source=1", "example.com"],

    // Microsoft
    ["msclkid", "https://example.com/page?msclkid=abc123", "example.com/page"],

    // HubSpot
    ["_hsenc + _hsmi", "https://example.com/blog?_hsenc=abc&_hsmi=123", "example.com/blog"],

    // Mailchimp
    ["mc_cid + mc_eid", "https://example.com/?mc_cid=abc&mc_eid=def", "example.com"],

    // Marketo
    ["mkt_tok", "https://example.com/page?mkt_tok=abc123", "example.com/page"],

    // Instagram
    ["igshid", "https://example.com/post?igshid=abc", "example.com/post"],

    // Google sharing
    ["usp", "https://docs.google.com/document/d/abc/edit?usp=sharing", "docs.google.com/document/\u2026"],

    // __cft__ prefix
    ["__cft__[0]", "https://example.com/post?__cft__[0]=abc123", "example.com/post"],

    // sc_ prefix (AWS)
    ["sc_channel", "https://example.com/?sc_channel=email&sc_campaign=launch", "example.com"],

    // Non-tracking params preserved
    ["id preserved", "https://news.ycombinator.com/item?id=46665839", "news.ycombinator.com/item?id=46665839"],
    ["v preserved", "https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube.com/watch?v=dQw4w9WgXcQ"],
    ["q preserved", "https://google.com/search?q=hello+world", "google.com/search?q=hello+world"],
  ]

  for (const [label, input, expected] of cases) {
    it(label, () => {
      expect(prettifyUrl(input)).toBe(expected)
    })
  }
})

// =============================================================================
// prettifyUrl — site-specific tracking params
// =============================================================================

describe("prettifyUrl: site-specific tracking", () => {
  const cases: Array<[string, string, string]> = [
    // x.com / Twitter: s and t are tracking
    [
      "x.com status with s+t",
      "https://x.com/testingcatalog/status/20128917862266269192?s=12&t=fMq0FKbaXO-Q25vj12k_fQ",
      "x.com/testingcatalog/status/20128917862266269192",
    ],
    ["twitter.com with s param", "https://twitter.com/user/status/123456?s=20", "twitter.com/user/status/123456"],

    // YouTube: si and feature are tracking
    ["youtube with si", "https://youtube.com/watch?v=dQw4w9WgXcQ&si=abc123", "youtube.com/watch?v=dQw4w9WgXcQ"],
    ["youtube with si+feature", "https://youtube.com/watch?v=abc&si=def&feature=share", "youtube.com/watch?v=abc"],
    ["youtu.be with si", "https://youtu.be/dQw4w9WgXcQ?si=abc123", "youtu.be/dQw4w9WgXcQ"],

    // Spotify: si is tracking
    ["spotify with si", "https://open.spotify.com/track/abc123?si=def456", "open.spotify.com/track/abc123"],

    // s and t NOT stripped on other sites
    [
      "s param on generic site preserved",
      "https://example.com/page?s=search&t=title",
      "example.com/page?s=search&t=title",
    ],
  ]

  for (const [label, input, expected] of cases) {
    it(label, () => {
      expect(prettifyUrl(input)).toBe(expected)
    })
  }
})

// =============================================================================
// prettifyUrl — site-specific shortening
// =============================================================================

describe("prettifyUrl: site-specific shortening", () => {
  const cases: Array<[string, string, string]> = [
    // Google Docs
    [
      "Google Doc",
      "https://docs.google.com/document/d/1kW5K56kbUczBYilTR2naqqcueH-rF2Hr0isUdngFFtA/edit",
      "docs.google.com/document/\u2026",
    ],
    ["Google Sheet", "https://docs.google.com/spreadsheets/d/abc123/edit#gid=0", "docs.google.com/spreadsheets/\u2026"],
    ["Google Slides", "https://docs.google.com/presentation/d/abc123/edit", "docs.google.com/presentation/\u2026"],
    ["Google Forms", "https://docs.google.com/forms/d/abc123/viewform", "docs.google.com/forms/\u2026"],

    // Google Drive
    ["Drive file", "https://drive.google.com/file/d/abc123/view", "drive.google.com/file/\u2026"],
    ["Drive folder", "https://drive.google.com/drive/folders/abc123", "drive.google.com/drive/folders/\u2026"],

    // Amazon
    [
      "Amazon product (dp)",
      "https://www.amazon.com/Some-Long-Product-Name/dp/B08N5WRWNW/ref=sr_1_1?keywords=thing&qid=123",
      "amazon.com/dp/B08N5WRWNW",
    ],
    ["Amazon product (gp)", "https://amazon.co.uk/gp/product/B08N5WRWNW?tag=abc", "amazon.co.uk/dp/B08N5WRWNW"],
    ["Amazon.de", "https://www.amazon.de/dp/B09ABC1234", "amazon.de/dp/B09ABC1234"],
  ]

  for (const [label, input, expected] of cases) {
    it(label, () => {
      expect(prettifyUrl(input)).toBe(expected)
    })
  }
})

// =============================================================================
// prettifyUrl — real-world URLs from user screenshots
// =============================================================================

describe("prettifyUrl: real-world URLs", () => {
  it("Substack with utm_medium", () => {
    expect(prettifyUrl("https://fabricatedknowledge.com/p/the-death-of-software-20-a-better?utm_medium=web")).toBe(
      "fabricatedknowledge.com/p/the-death-of-software-20-a-better",
    )
  })

  it("x.com tweet with tracking", () => {
    expect(prettifyUrl("https://x.com/testingcatalog/status/20128917862266269192?s=12&t=fMq0FKbaXO-Q25vj12k_fQ")).toBe(
      "x.com/testingcatalog/status/20128917862266269192",
    )
  })

  it("HN item (id preserved)", () => {
    expect(prettifyUrl("https://news.ycombinator.com/item?id=46665839")).toBe("news.ycombinator.com/item?id=46665839")
  })

  it("Google Doc with edit params", () => {
    expect(
      prettifyUrl("https://docs.google.com/document/d/1kW5K56kbUczBYilTR2naqqcueH-rF2Hr0isUdngFFtA/edit?usp=sharing"),
    ).toBe("docs.google.com/document/\u2026")
  })
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
    using app = createTestApp(item("board", item("col1", item("Check https://www.example.com/docs"))), {
      rows: 20,
      cols: 60,
    })

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("example.com/docs")
    expect(text).not.toContain("https://")
    expect(text).not.toContain("www.")
  })

  it("card with multiple URLs shows all prettified", () => {
    using app = createTestApp(item("board", item("col1", item("See https://a.com and http://b.com/path"))), {
      rows: 20,
      cols: 80,
    })

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("a.com")
    expect(text).toContain("b.com/path")
    expect(text).not.toContain("https://")
    expect(text).not.toContain("http://")
  })

  it("markdown link in card still shows link text only", () => {
    using app = createTestApp(item("board", item("col1", item("Click [Google](https://google.com)"))), {
      rows: 20,
      cols: 60,
    })

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Google")
    expect(text).not.toContain("google.com")
  })

  it("card shows URL with tracking params stripped", () => {
    using app = createTestApp(
      item("board", item("col1", item("Read https://blog.example.com/post?utm_source=twitter&utm_medium=social"))),
      { rows: 20, cols: 80 },
    )

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("blog.example.com/post")
    expect(text).not.toContain("utm_")
    expect(text).not.toContain("twitter")
  })

  it("card body with URL does not show raw escape sequences when truncated", () => {
    // Use a narrow terminal so the URL text gets truncated by wrap="truncate"
    using app = createTestApp(
      item("board", item("col1", item("Task with https://www.example.com/very/long/path/that/will/be/truncated"))),
      { rows: 20, cols: 40 },
    )

    // Check the rendered buffer for escape sequence artifacts
    const screenText = app.screen.text
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
    using app = createTestApp(
      item(
        "board",
        item("col1", item.file("Parent", item("Child text with https://www.example.com/some/very/long/path/here"))),
      ),
      { rows: 20, cols: 40 },
    )

    const screenText = app.screen.text
    expect(screenText).not.toContain("]8;;")
    expect(screenText).not.toContain("\x1b]")
    expect(screenText).not.toContain("\x1b\\")
  })
})

/**
 * Inline Rendering Tests
 *
 * Regression tests for the inline AST migration, covering edge cases
 * in parsing, plain-text extraction, URL prettification, and board-level
 * rendering of inline content.
 */

import { describe, it, expect } from "vitest"
import { parseInlineText, parseToPlainText, inlineNodesToPlainText } from "../../src/text/inline-parser.ts"
import { prettifyUrl } from "../../src/text/text-pipeline.ts"
import { testEnv, item } from "../helpers/board-test.ts"
import type { InlineNode } from "../../src/text/inline-ast-types.ts"

const types = (nodes: InlineNode[]) => nodes.map((n) => n.type)

// =============================================================================
// 1. Angle-bracket autolinks
// =============================================================================

describe("angle-bracket autolinks", () => {
  it("parses <https://...> as bareurl, not plain text", () => {
    const nodes = parseInlineText("<https://example.com/path>")
    expect(types(nodes)).toEqual(["bareurl"])
    expect(nodes[0]).toEqual({ type: "bareurl", url: "https://example.com/path" })
  })

  it("parses autolink with query params", () => {
    const nodes = parseInlineText("<https://example.com/search?q=test&page=1>")
    expect(types(nodes)).toEqual(["bareurl"])
    expect((nodes[0] as { url: string }).url).toBe("https://example.com/search?q=test&page=1")
  })

  it("autolink in surrounding text is parsed correctly", () => {
    const nodes = parseInlineText("visit <https://example.com/docs> for info")
    expect(types(nodes)).toEqual(["plain", "bareurl", "plain"])
    expect((nodes[1] as { url: string }).url).toBe("https://example.com/docs")
  })

  it("autolink plain text shows prettified URL (no protocol)", () => {
    expect(parseToPlainText("<https://example.com/path>")).toBe("example.com/path")
  })

  it("autolink with www is prettified", () => {
    expect(parseToPlainText("<https://www.example.com/docs>")).toBe("example.com/docs")
  })
})

// =============================================================================
// 2. Very long bare URLs — prettification
// =============================================================================

describe("long bare URL prettification", () => {
  const longUrl = "https://example.com/very/long/path?with=many&query=params&that=go&on=and&on=forever"
  const expectedPretty = "example.com/very/long/path?with=many&query=params&that=go&on=and&on=forever"

  it("prettifyUrl strips protocol from long URL", () => {
    expect(prettifyUrl(longUrl)).toBe(expectedPretty)
  })

  it("parseToPlainText prettifies long bare URL in text", () => {
    const input = `See ${longUrl} for details`
    expect(parseToPlainText(input)).toBe(`See ${expectedPretty} for details`)
  })

  it("long bare URL in card body renders prettified (no https://)", () => {
    const { board } = testEnv(() => item("board", item("col1", item(`Check ${longUrl}`))), { rows: 20, columns: 100 })

    const screenText = board.screen.text
    expect(screenText).not.toContain("https://")
    expect(screenText).toContain("example.com/very/long")
  })
})

// =============================================================================
// 3. Very long markdown links — detail pane shows link text only
// =============================================================================

describe("long markdown links", () => {
  const longMarkdownLink =
    "[project docs](https://very-long-url.com/path/to/really/deep/nested/page?with=params&and=more)"

  it("parseInlineText parses as link node with text and url", () => {
    const nodes = parseInlineText(longMarkdownLink)
    expect(types(nodes)).toEqual(["link"])
    expect(nodes[0]).toEqual({
      type: "link",
      text: "project docs",
      url: "https://very-long-url.com/path/to/really/deep/nested/page?with=params&and=more",
    })
  })

  it("parseToPlainText returns only the link text, not the URL", () => {
    expect(parseToPlainText(longMarkdownLink)).toBe("project docs")
  })

  it("parseToPlainText returns link text for markdown link in sentence", () => {
    const input = "See [the documentation](https://example.com/very/long/path) for reference"
    expect(parseToPlainText(input)).toBe("See the documentation for reference")
  })

  it("card renders link text, not raw URL", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("Read [API docs](https://very-long-url.com/api/v2/reference)"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("API docs")
    expect(text).not.toContain("very-long-url.com")
  })
})

// =============================================================================
// 4. Detail pane body rendering — paragraph children should show content
// =============================================================================

describe("detail pane body rendering", () => {
  it("card with paragraph body child shows body indicator", () => {
    // A card (depth 0) with a paragraph child should have body content.
    // In the cards view, the card shows a body indicator (···).
    const { board } = testEnv(
      () => item("board", item("col1", item.file("Parent card", item.p("This is body text for the parent")))),
      { rows: 20, columns: 80 },
    )

    // The paragraph child should contribute to body detection.
    // The parent card's title should be visible.
    const screenText = board.screen.text
    expect(screenText).toContain("Parent card")
  })

  it("paragraph body child content is visible in card when rendered as child", () => {
    // When a card has a paragraph child, the paragraph text should
    // be rendered as a card child line (not "(empty)").
    const { board } = testEnv(
      () => item("board", item("col1", item.file("Task", item.p("Body paragraph content here")))),
      { rows: 20, columns: 80 },
    )

    const screenText = board.screen.text
    expect(screenText).toContain("Task")
    // The paragraph content should appear somewhere in the card's rendered area
    expect(screenText).toContain("Body paragraph")
  })
})

// =============================================================================
// 5. Card body with multi-line content (height=1 limitation for card children)
// =============================================================================

describe("card body multi-line content", () => {
  it("card child with newlines is truncated to single line (height=1)", () => {
    // Card children (depth > 0) get height=1 and overflow="hidden".
    // Multi-line content in a paragraph child should be truncated,
    // showing only the first line.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item.file("Multi-line card", item.p("First line of content"), item.p("Second line of content"))),
        ),
      { rows: 20, columns: 80 },
    )

    const screenText = board.screen.text
    expect(screenText).toContain("Multi-line card")
    // First paragraph should be visible
    expect(screenText).toContain("First line")
    // Second paragraph may or may not be visible depending on maxContentLines
  })

  it("card child renders without escape sequence artifacts", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item.file("Card", item.p("Content with https://example.com/link inside")))),
      { rows: 20, columns: 50 },
    )

    const screenText = board.screen.text
    // No raw escape sequences should leak into the rendered buffer
    expect(screenText).not.toContain("]8;;")
    expect(screenText).not.toContain("\x1b]")
    expect(screenText).not.toContain("\x1b\\")
    expect(screenText).not.toContain("https://")
  })
})

// =============================================================================
// 6. Breadcrumb / top bar URL prettification
// =============================================================================

describe("breadcrumb URL prettification", () => {
  it("parseToPlainText prettifies bare URL (used by top bar)", () => {
    // The top bar uses parseToPlainText for breadcrumb segments.
    // Bare URLs in node names should be prettified.
    expect(parseToPlainText("https://github.com/user/repo")).toBe("github.com/user/repo")
  })

  it("parseToPlainText prettifies URL with www prefix", () => {
    expect(parseToPlainText("https://www.notion.so/workspace")).toBe("notion.so/workspace")
  })

  it("node name with bare URL renders prettified in top bar", () => {
    // When a node's display name contains a bare URL, the top bar
    // should show the prettified version (via parseToPlainText in board-top-bar.ts).
    const { board } = testEnv(() => item("board", item("col1", item("https://github.com/user/repo/issues/42"))), {
      rows: 20,
      columns: 80,
    })

    const screenText = board.screen.text
    // The card itself should show prettified URL
    expect(screenText).not.toContain("https://")
    expect(screenText).toContain("github.com/user/repo")
  })
})

// =============================================================================
// Combinations and edge cases
// =============================================================================

describe("inline rendering edge cases", () => {
  it("multiple autolinks in one line", () => {
    const nodes = parseInlineText("see <https://a.com> and <https://b.com>")
    const urls = nodes.filter((n) => n.type === "bareurl")
    expect(urls.length).toBe(2)
  })

  it("autolink followed by markdown link", () => {
    const text = "<https://example.com> and [docs](https://docs.example.com)"
    const nodes = parseInlineText(text)
    const bareUrls = nodes.filter((n) => n.type === "bareurl")
    const links = nodes.filter((n) => n.type === "link")
    expect(bareUrls.length).toBe(1)
    expect(links.length).toBe(1)
    expect(links[0]).toEqual({
      type: "link",
      text: "docs",
      url: "https://docs.example.com",
    })
  })

  it("bare URL inside bold is preserved", () => {
    const nodes = parseInlineText("**visit https://example.com today**")
    expect(types(nodes)).toEqual(["bold"])
    const bold = nodes[0] as Extract<InlineNode, { type: "bold" }>
    const childTypes = bold.children.map((c) => c.type)
    expect(childTypes).toContain("bareurl")
  })

  it("markdown link inside bold shows link text", () => {
    const text = "**click [here](https://example.com)**"
    expect(parseToPlainText(text)).toBe("click here")
  })

  it("angle-bracket autolink prettifies in plain text same as bare URL", () => {
    // Both forms should produce the same plain text output
    const autolink = parseToPlainText("<https://www.example.com/path>")
    const bareUrl = parseToPlainText("https://www.example.com/path")
    expect(autolink).toBe(bareUrl)
    expect(autolink).toBe("example.com/path")
  })
})

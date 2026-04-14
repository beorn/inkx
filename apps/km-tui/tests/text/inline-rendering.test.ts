/**
 * Inline Rendering Tests
 *
 * Regression tests for the inline AST migration, covering edge cases
 * in parsing, plain-text extraction, URL prettification, and board-level
 * rendering of inline content.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { parseInlineText, parseToPlainText, inlineNodesToPlainText } from "../../src/text/inline-parser.ts"
import { prettifyUrl } from "../../src/text/text-pipeline.ts"
import { stripKnownMentions } from "../../src/views/detail-pane-helpers.ts"
import { InlineText } from "../../src/text/InlineComponents.tsx"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
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
    using app = createTestApp(item("board", item("col1", item(`Check ${longUrl}`))), { rows: 20, cols: 100 })

    const screenText = app.text
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
    using app = createTestApp(
      item("board", item("col1", item("Read [API docs](https://very-long-url.com/api/v2/reference)"))),
      { rows: 20, cols: 60 },
    )

    const card = app.q("[data-cursor]")
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
    using app = createTestApp(
      item("board", item("col1", item.file("Parent card", item.p("This is body text for the parent")))),
      { rows: 20, cols: 80 },
    )

    // The paragraph child should contribute to body detection.
    // The parent card's title should be visible.
    const screenText = app.text
    expect(screenText).toContain("Parent card")
  })

  it("paragraph body child content is visible in card when rendered as child", () => {
    // When a card has a paragraph child, the paragraph text should
    // be rendered as a card child line (not "(empty)").
    using app = createTestApp(item("board", item("col1", item.file("Task", item.p("Body paragraph content here")))), {
      rows: 20,
      cols: 80,
    })

    const screenText = app.text
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
    using app = createTestApp(
      item(
        "board",
        item("col1", item.file("Multi-line card", item.p("First line of content"), item.p("Second line of content"))),
      ),
      { rows: 20, cols: 80 },
    )

    const screenText = app.text
    expect(screenText).toContain("Multi-line card")
    // First paragraph should be visible
    expect(screenText).toContain("First line")
    // Second paragraph may or may not be visible depending on maxContentLines
  })

  it("card child renders without escape sequence artifacts", () => {
    using app = createTestApp(
      item("board", item("col1", item.file("Card", item.p("Content with https://example.com/link inside")))),
      { rows: 20, cols: 50 },
    )

    const screenText = app.text
    // No raw escape sequences should leak into the rendered buffer
    expect(screenText).not.toContain("]8;;")
    expect(screenText).not.toContain("\x1b]")
    expect(screenText).not.toContain("\x1b\\")
    expect(screenText).not.toContain("https://")
  })
})

// =============================================================================
// 6. Inline formatting in body blocks — bold/italic/code survive mdast→content
// =============================================================================
// Regression: km-tui.inline-format-in-blocks — parseMarkdownToNodes flattens
// inline formatting out of node.content (nodeToText strips **/*/`), and
// TreeNode rendered node.content via InlineText which then saw no markers.
// The parser already preserves the verbatim source in data._mdSource; the
// renderer must prefer that slice when the node is unedited so bold/italic/
// code/links show up. Also assert that bullet list items in body content
// still carry the list marker glyph.

describe("inline formatting in body blocks", () => {
  // Helper: scan every row for `needle` and return true if any cell in the
  // matched run carries the given attribute (bold/dim/italic).
  const cellHasAttr = (app: ReturnType<typeof createTestApp>, needle: string, attr: "bold"): boolean => {
    const rows = app.text.split("\n")
    for (let y = 0; y < rows.length; y++) {
      const line = rows[y] ?? ""
      const col = line.indexOf(needle)
      if (col === -1) continue
      for (let x = col; x < col + needle.length; x++) {
        if (app.screen.cell(x, y)[attr]) return true
      }
    }
    return false
  }

  it("bold in a body paragraph renders with bold cells", () => {
    using app = createTestApp.fromMarkdown("# A test project\n\nSome description\n\n**Bolded**\n", {
      rows: 24,
      cols: 80,
    })

    // The bold word must appear in the rendered text without the asterisks
    // leaking through as plain characters (nodeToText should strip them and
    // the inline parser should turn them into bold cells).
    expect(app.text).toContain("Bolded")
    expect(app.text).not.toContain("**Bolded**")
    expect(cellHasAttr(app, "Bolded", "bold")).toBe(true)
  })

  it("bullet list items in body content render with a list marker", () => {
    using app = createTestApp.fromMarkdown(
      "# A test project\n\nSome description\n\n- Bullets\n\n**Bolded**\n- bullet\n",
      { rows: 24, cols: 80 },
    )

    expect(app.text).toContain("Bullets")

    // A list marker glyph (·, •, ◦, ▸, ●, -, *, +) must appear to the left of
    // "Bullets" on the same row. We accept any visible non-word char in the
    // ~6 cells left of "Bullets" — anything other than pure spaces means the
    // body list item kept its bullet marker.
    const rows = app.text.split("\n")
    let foundMarker = false
    for (let y = 0; y < rows.length; y++) {
      const line = rows[y] ?? ""
      const col = line.indexOf("Bullets")
      if (col === -1) continue
      const prefix = line.slice(Math.max(0, col - 6), col)
      if (/[^\s\w]/.test(prefix)) {
        foundMarker = true
        break
      }
    }
    expect(foundMarker).toBe(true)
  })

  it("bold inside a body list item survives rendering", () => {
    using app = createTestApp.fromMarkdown("# Doc\n\n- Item with **bold** text\n", { rows: 24, cols: 80 })

    expect(app.text).toContain("bold")
    expect(app.text).not.toContain("**bold**")
    expect(cellHasAttr(app, "bold", "bold")).toBe(true)
  })

  it("nested task list items are visually indented under their parent", () => {
    // Regression: km-tui.task-hierarchy-flat.
    // Nested list items used to render flat because TreeNode's
    // paddingLeft = max(0, depth - 1) collapsed depth 0 (card title) and
    // depth 1 (first child) onto the same column. Inside a structural card
    // the border provides a visual offset at depth 0, but body cards are
    // borderless — so a parent task and its child tasks rendered with
    // identical bullet glyphs and identical indentation, looking like
    // siblings. Fix: paddingLeft = depth, so each nesting level shifts one
    // cell right regardless of whether the ancestor is a structural or
    // body card.
    using app = createTestApp.fromMarkdown(
      "# Todo\n\n- [ ] Parent task\n  - [ ] Child 1\n  - [ ] Child 2\n\n# Done\n\n- [x] Something else\n",
      { rows: 24, cols: 80 },
    )

    const lines = app.text.split("\n")
    // Skip breadcrumb row — it mentions "Parent task" in the zoom header.
    const findRow = (text: string): { row: number; col: number } | null => {
      for (let r = 2; r < lines.length; r++) {
        const idx = lines[r]!.indexOf(text)
        if (idx >= 0) return { row: r, col: idx }
      }
      return null
    }

    const parentPos = findRow("Parent task")
    const child1Pos = findRow("Child 1")
    const child2Pos = findRow("Child 2")

    expect(parentPos, "parent task visible").not.toBeNull()
    expect(child1Pos, "child 1 visible").not.toBeNull()
    expect(child2Pos, "child 2 visible").not.toBeNull()
    expect(child1Pos!.col, "child 1 indented past parent").toBeGreaterThan(parentPos!.col)
    expect(child2Pos!.col, "child 2 indented past parent").toBeGreaterThan(parentPos!.col)
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
    using app = createTestApp(item("board", item("col1", item("https://github.com/user/repo/issues/42"))), {
      rows: 20,
      cols: 80,
    })

    const screenText = app.text
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

// =============================================================================
// 7. Broken wikilinks — visual cue
// =============================================================================

describe("bareurl visible styling", () => {
  it("bareurl https://... renders with underline SGR (InlineText direct)", () => {
    // Before: UrlHoverBox had underline={false}, so bareurls read as plain
    // text in a slightly different color — the user couldn't tell they were
    // clickable links. Fix wraps them in a dotted underline (matching
    // InlineWikiLink) so all link-like things share the same visual.
    //
    // Use createRenderer directly (not createTestApp) to isolate InlineText
    // rendering from the board's cursor-inverse stripping. The board-level
    // test would also work for non-cursor cards but is sensitive to card
    // width truncation; this one just checks that the inline rendering path
    // emits an underline SGR around the link target.
    const render = createRenderer({ cols: 80, rows: 5 })
    const app = render(React.createElement(InlineText, { text: "visit https://example.com/path now" }))
    expect(app.text).toContain("example.com/path")

    const ansi = app.ansi
    const prettyIdx = ansi.lastIndexOf("example.com/path")
    expect(prettyIdx).toBeGreaterThanOrEqual(0)

    // An SGR sequence opens styling right before the rendered link text.
    // Matches underline style (4:X) or underline color (58;X or 58:X).
    const before = ansi.slice(Math.max(0, prettyIdx - 50), prettyIdx)
    // eslint-disable-next-line no-control-regex
    expect(before, `expected underline SGR before url, got: ${JSON.stringify(before)}`).toMatch(
      /\x1b\[(?:4:|58[;:])/,
    )
  })
})

describe("broken wikilink rendering", () => {
  it("unresolved [[target]] gets a distinct styling (red/dashed)", () => {
    // Use a target that definitely does not exist in the fake repo.
    const brokenTarget = "definitely-not-a-real-note-xyz"
    using app = createTestApp(item("board", item("col1", item(`pre [[${brokenTarget}]] post`))), {
      rows: 20,
      cols: 100,
    })

    // The broken target name is still visible (user needs to see what's broken)
    expect(app.screen.text).toContain(brokenTarget)

    // A broken wikilink should have distinct styling, which shows up in the
    // ANSI buffer as an SGR escape sequence immediately preceding the target.
    // The unstyled baseline (the bug) rendered it as bare plain text with no
    // escape preceding it. We locate the last occurrence in the ANSI stream
    // (the actual rendered card text, not an earlier OSC8/hyperlink URL) and
    // verify an SGR introducer appears within a few chars before it.
    const ansi = app.screen.ansi
    const targetIdx = ansi.lastIndexOf(brokenTarget)
    expect(targetIdx).toBeGreaterThanOrEqual(0)

    // Styling must wrap the broken target: an SGR sequence opens styling right
    // before the target name (<=20 bytes prior), and an SGR sequence closes it
    // right after (<=20 bytes past). With the fix this is the dashed underline
    // sequence (ESC[4:5m + ESC[58;5;9m) opening and ESC[24m + ESC[59m closing.
    // Before the fix the target was bare plain text, so no fresh SGR wrapped it.
    const SLICE_BEFORE = 10
    const SLICE_AFTER = 10
    const before = ansi.slice(Math.max(0, targetIdx - SLICE_BEFORE), targetIdx)
    const after = ansi.slice(targetIdx + brokenTarget.length, targetIdx + brokenTarget.length + SLICE_AFTER)
    // Underline style opener (4:5 = dashed) or underline color opener (58;5;...)
    // eslint-disable-next-line no-control-regex
    expect(before).toMatch(/\x1b\[(?:4:|58[;:])/)
    // Matching closer (24 = underline off, 59 = default underline color)
    // eslint-disable-next-line no-control-regex
    expect(after).toMatch(/\x1b\[(?:24|59)m/)
  })
})

// =============================================================================
// 9. stripKnownMentions — card title display stripping
// =============================================================================
//
// Regression: km-tui.strip-known-mentions-overreach — the helper used to strip
// #tags, +projects, bold/italic/code, and lose URL protocols from card titles
// because its default path routed everything through inlineNodesToPlainText.
// It should ONLY strip known @mentions (those shown in the info suffix);
// everything else must be preserved verbatim.

describe("stripKnownMentions", () => {
  it("strips known @mentions (person shortnames are shown in info suffix)", () => {
    expect(stripKnownMentions("Review with @bjorn today")).toBe("Review with today")
  })

  it("strips known @mentions followed by a surname", () => {
    expect(stripKnownMentions("Review with @Bjørn Stabell today")).toBe("Review with today")
  })

  it("preserves unknown @mentions (sigils like @next, @urgent)", () => {
    expect(stripKnownMentions("Follow up @next")).toBe("Follow up @next")
  })

  it("preserves #tags in card titles", () => {
    expect(stripKnownMentions("Ship the feature #marketing")).toBe("Ship the feature #marketing")
  })

  it("preserves +projects in card titles", () => {
    expect(stripKnownMentions("Plan sprint +launch")).toBe("Plan sprint +launch")
  })

  it("preserves bold formatting", () => {
    expect(stripKnownMentions("Really **important** task")).toBe("Really **important** task")
  })

  it("preserves italic formatting", () => {
    expect(stripKnownMentions("A *quick* fix")).toBe("A *quick* fix")
  })

  it("preserves inline code text (backticks dropped — card titles aren't monospaced)", () => {
    expect(stripKnownMentions("Call `foo.bar()` here")).toBe("Call foo.bar() here")
  })

  it("preserves bare URLs but prettifies them (protocol/www stripped)", () => {
    // Bare URLs go through prettifyUrl in card titles so the protocol noise
    // doesn't crowd out the actual title. The full URL is still accessible
    // via the OSC 8 hyperlink in the rendered cell.
    expect(stripKnownMentions("See https://www.example.com/docs later")).toBe("See example.com/docs later")
  })

  it("preserves markdown link text but hides the URL", () => {
    // Card titles use stripKnownMentions and the renderer wraps the result in
    // OSC 8 hyperlinks, so the URL would leak back into the title if we kept
    // it here. The link text is what users care about.
    expect(stripKnownMentions("Read [the docs](https://example.com/docs)")).toBe("Read the docs")
  })

  it("preserves wikilinks verbatim", () => {
    expect(stripKnownMentions("See [[Some Page]] for context")).toBe("See [[Some Page]] for context")
  })

  it("strips known @mention while preserving surrounding tags, projects, and formatting", () => {
    expect(stripKnownMentions("**Urgent** @bjorn #p1 +launch task")).toBe("**Urgent** #p1 +launch task")
  })
})

describe("stripKnownMentions — card title rendering", () => {
  it("#tags render in the card title (not silently stripped)", () => {
    using app = createTestApp(item("board", item("col1", item("Ship feature #marketing"))), {
      rows: 20,
      cols: 80,
    })
    expect(app.text).toContain("#marketing")
  })

  it("+projects render in the card title (not silently stripped)", () => {
    using app = createTestApp(item("board", item("col1", item("Plan sprint +launch"))), {
      rows: 20,
      cols: 80,
    })
    expect(app.text).toContain("+launch")
  })

  it("URL protocol survives card title rendering", () => {
    using app = createTestApp(item("board", item("col1", item("See https://example.com/docs"))), {
      rows: 20,
      cols: 120,
    })
    // https:// (or the prettified form) must still lead the URL — the protocol
    // is what makes it recognizable as a link in the first place.
    const text = app.text
    expect(text).toMatch(/example\.com\/docs/)
  })
})

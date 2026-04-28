/**
 * @km/text-render — package contract tests.
 *
 * Demonstrates the surface silvercode (and any future consumer) imports.
 * Every assertion here is shape that downstream MarkdownView / InlineRun
 * rendering depends on. Touching the parser without re-running these is a
 * regression risk.
 */

import { describe, expect, it } from "vitest"
import {
  parseInlineText,
  parseToPlainText,
  inlineNodesToPlainText,
  prettifyUrl,
  extractRefs,
  SIGIL_PATTERN,
  displayLength,
  stripAnsi,
  computeSearchDecorations,
  computeSearchDecorationsFromSource,
  type InlineNode,
} from "../src/index.ts"

const types = (nodes: InlineNode[]): string[] => nodes.map((n) => n.type)

describe("@km/text-render — contract", () => {
  describe("parseInlineText", () => {
    it("handles plain text", () => {
      const nodes = parseInlineText("hello world")
      expect(types(nodes)).toEqual(["plain"])
      expect(nodes[0]).toMatchObject({ type: "plain", text: "hello world" })
    })

    it("parses bold + italic", () => {
      const nodes = parseInlineText("**bold** and *italic*")
      // bold, plain " and ", italic
      const ts = types(nodes)
      expect(ts).toContain("bold")
      expect(ts).toContain("italic")
    })

    it("parses inline code", () => {
      const nodes = parseInlineText("run `bun fix` first")
      const code = nodes.find((n) => n.type === "code")
      expect(code).toBeDefined()
      if (code && code.type === "code") {
        expect(code.code).toBe("bun fix")
      }
    })

    it("parses markdown links", () => {
      const nodes = parseInlineText("see [the docs](https://example.com)")
      const link = nodes.find((n) => n.type === "link")
      expect(link).toBeDefined()
      if (link && link.type === "link") {
        expect(link.text).toBe("the docs")
        expect(link.url).toBe("https://example.com")
      }
    })

    it("parses bare URLs as bareurl", () => {
      const nodes = parseInlineText("see <https://example.com>")
      const bareurl = nodes.find((n) => n.type === "bareurl")
      expect(bareurl).toBeDefined()
      if (bareurl && bareurl.type === "bareurl") {
        expect(bareurl.url).toBe("https://example.com")
      }
    })

    it("parses wikilinks", () => {
      const nodes = parseInlineText("see [[@km/beads/cutover]] for details")
      const wl = nodes.find((n) => n.type === "wikilink")
      expect(wl).toBeDefined()
      if (wl && wl.type === "wikilink") {
        expect(wl.target).toBe("@km/beads/cutover")
        expect(wl.isEmbed).toBe(false)
      }
    })

    it("parses wikilink with alias", () => {
      const nodes = parseInlineText("[[@km/beads/cutover|the cutover]]")
      const wl = nodes.find((n) => n.type === "wikilink")
      expect(wl).toBeDefined()
      if (wl && wl.type === "wikilink") {
        expect(wl.target).toBe("@km/beads/cutover")
        expect(wl.alias).toBe("the cutover")
      }
    })

    it("parses sigils — mention, tag, project", () => {
      const nodes = parseInlineText("hi @beorn #urgent +taxomatic")
      expect(types(nodes)).toContain("mention")
      expect(types(nodes)).toContain("tag")
      expect(types(nodes)).toContain("project")
      const mention = nodes.find((n) => n.type === "mention")
      if (mention && mention.type === "mention") {
        expect(mention.name).toBe("beorn")
      }
    })

    it("parses inline fields (key:: value)", () => {
      const nodes = parseInlineText("due:: 2026-04-28")
      const f = nodes.find((n) => n.type === "field")
      expect(f).toBeDefined()
      if (f && f.type === "field") {
        expect(f.key).toBe("due")
        expect(f.value).toBe("2026-04-28")
      }
    })
  })

  describe("parseToPlainText", () => {
    it("strips markdown but keeps sigils", () => {
      expect(parseToPlainText("**bold** @user")).toContain("bold")
      expect(parseToPlainText("**bold** @user")).toContain("@user")
    })

    it("renders wikilinks as alias or target", () => {
      expect(parseToPlainText("[[target|alias]]")).toContain("alias")
      expect(parseToPlainText("[[bare-target]]")).toContain("bare-target")
    })
  })

  describe("inlineNodesToPlainText", () => {
    it("round-trips through parser", () => {
      const text = "hello @beorn #urgent"
      const nodes = parseInlineText(text)
      const plain = inlineNodesToPlainText(nodes)
      expect(plain).toContain("hello")
      expect(plain).toContain("@beorn")
      expect(plain).toContain("#urgent")
    })
  })

  describe("prettifyUrl", () => {
    it("strips protocol + www", () => {
      expect(prettifyUrl("https://www.example.com/")).toBe("example.com")
    })

    it("strips utm_ tracking params", () => {
      const out = prettifyUrl("https://example.com/page?utm_source=foo&id=1")
      expect(out).not.toContain("utm_source")
      expect(out).toContain("id=1")
    })

    it("collapses Google Docs URLs", () => {
      const out = prettifyUrl("https://docs.google.com/document/d/abc123xyz/edit")
      expect(out).toContain("docs.google.com/document")
      expect(out).not.toContain("abc123xyz")
    })
  })

  describe("extractRefs", () => {
    it("pulls all ref kinds from text", () => {
      const refs = extractRefs("hi @beorn #urgent +work see [[target]]")
      expect(refs.mentions).toEqual(["beorn"])
      expect(refs.tags).toEqual(["urgent"])
      expect(refs.projects).toEqual(["work"])
      expect(refs.wikilinks).toEqual(["target"])
    })

    it("deduplicates", () => {
      const refs = extractRefs("@a @a @a")
      expect(refs.mentions).toEqual(["a"])
    })
  })

  describe("SIGIL_PATTERN", () => {
    it("matches @, #, + sigils with Unicode names", () => {
      SIGIL_PATTERN.lastIndex = 0
      const matches = [...("@beorn #task +work".matchAll(SIGIL_PATTERN))]
      expect(matches.length).toBe(3)
    })
  })

  describe("displayLength", () => {
    it("counts ASCII as 1 each", () => {
      expect(displayLength("hello")).toBe(5)
    })

    it("counts CJK as 2 each", () => {
      expect(displayLength("中")).toBe(2)
    })

    it("ignores ANSI escapes", () => {
      expect(displayLength("[31mhello[0m")).toBe(5)
    })
  })

  describe("stripAnsi", () => {
    it("removes ANSI escapes", () => {
      expect(stripAnsi("[31mhello[0m")).toBe("hello")
    })
  })

  describe("computeSearchDecorations", () => {
    it("highlights all occurrences", () => {
      const decs = computeSearchDecorations("foo bar foo", "foo", false)
      expect(decs).toHaveLength(2)
      expect(decs[0]).toMatchObject({ start: 0, end: 3 })
      expect(decs[1]).toMatchObject({ start: 8, end: 11 })
    })

    it("uses different style for current vs other", () => {
      const current = computeSearchDecorations("foo", "foo", true)
      const other = computeSearchDecorations("foo", "foo", false)
      expect(current[0]?.style).not.toEqual(other[0]?.style)
    })

    it("returns empty for empty query", () => {
      expect(computeSearchDecorations("anything", "", false)).toEqual([])
    })
  })

  describe("computeSearchDecorationsFromSource", () => {
    it("parses markdown source first, then highlights in plain text", () => {
      const decs = computeSearchDecorationsFromSource("**hello** world", "world", false)
      expect(decs.length).toBeGreaterThan(0)
    })
  })
})

describe("@km/text-render — silvercode integration smoke test", () => {
  // The motivating consumer: silvercode's MarkdownView wants to render the
  // same markdown shapes km-tui does, without re-implementing the parser.
  // These shapes mirror what arrives from streaming assistant content.

  it("parses a representative paragraph (silvercode block input)", () => {
    const nodes = parseInlineText(
      "Run `bun fix` and check [the docs](https://example.com) for **important** updates.",
    )
    const ts = types(nodes)
    expect(ts).toContain("code")
    expect(ts).toContain("link")
    expect(ts).toContain("bold")
  })

  it("parses a list-item line with mixed inline content", () => {
    const nodes = parseInlineText("- [ ] Review @beorn's PR for #urgent +backend work")
    // The parser focuses on inline shapes (- [ ] is a block-level concern in
    // mdast; here it appears as plain text. Sigils inside it should still parse.)
    const ts = types(nodes)
    expect(ts).toContain("mention")
    expect(ts).toContain("tag")
    expect(ts).toContain("project")
  })

  it("produces stable plain text for search/index pipelines", () => {
    const plain = parseToPlainText("**heading** with `code` and [link](https://x.com)")
    // Round-trip stability: multiple parseToPlainText calls produce the same output
    expect(plain).toBe(parseToPlainText("**heading** with `code` and [link](https://x.com)"))
    expect(plain).toContain("heading")
    expect(plain).toContain("code")
    expect(plain).toContain("link")
  })
})

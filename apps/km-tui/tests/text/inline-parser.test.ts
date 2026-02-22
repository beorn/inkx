import { describe, expect, it } from "vitest"
import { parseInlineText, inlineNodesToPlainText } from "../../src/text/inline-parser.ts"
import type { InlineNode } from "../../src/text/inline-ast-types.ts"

// Helper to extract just types from a flat parse
const types = (nodes: InlineNode[]) => nodes.map((n) => n.type)

describe("parseInlineText", () => {
  // ── Plain text ──────────────────────────────────────────────────────────

  it("returns empty array for empty string", () => {
    expect(parseInlineText("")).toEqual([])
  })

  it("parses plain text", () => {
    const nodes = parseInlineText("hello world")
    expect(nodes).toEqual([{ type: "plain", text: "hello world" }])
  })

  // ── Code spans ──────────────────────────────────────────────────────────

  it("parses inline code", () => {
    const nodes = parseInlineText("use `bun test` to run")
    expect(types(nodes)).toEqual(["plain", "code", "plain"])
    expect(nodes[1]).toEqual({ type: "code", code: "bun test" })
  })

  it("code is opaque (no formatting inside)", () => {
    const nodes = parseInlineText("`**not bold**`")
    expect(nodes).toEqual([{ type: "code", code: "**not bold**" }])
  })

  // ── Links ───────────────────────────────────────────────────────────────

  it("parses markdown links", () => {
    const nodes = parseInlineText("see [docs](https://example.com) for more")
    expect(types(nodes)).toEqual(["plain", "link", "plain"])
    expect(nodes[1]).toEqual({ type: "link", text: "docs", url: "https://example.com" })
  })

  it("parses wiki links", () => {
    const nodes = parseInlineText("see [[note-name]] for details")
    expect(types(nodes)).toEqual(["plain", "wikilink", "plain"])
    expect(nodes[1]).toEqual({ type: "wikilink", target: "note-name", alias: undefined, isEmbed: false })
  })

  it("parses wiki links with alias", () => {
    const nodes = parseInlineText("see [[path/to/note|Display Name]]")
    expect(types(nodes)).toEqual(["plain", "wikilink"])
    expect(nodes[1]).toEqual({ type: "wikilink", target: "path/to/note", alias: "Display Name", isEmbed: false })
  })

  it("parses embed wiki links", () => {
    const nodes = parseInlineText("![[embedded-note]]")
    expect(nodes).toEqual([{ type: "wikilink", target: "embedded-note", alias: undefined, isEmbed: true }])
  })

  it("parses embed block references ![[^GID]]", () => {
    const nodes = parseInlineText("![[^1201889996442258]]")
    expect(nodes).toEqual([{ type: "wikilink", target: "", alias: undefined, isEmbed: true }])
  })

  it("parses text before and after embed block ref", () => {
    const nodes = parseInlineText("Monthly updates ![[^1201889996442258]]")
    expect(types(nodes)).toEqual(["plain", "wikilink"])
    expect(nodes[0]).toEqual({ type: "plain", text: "Monthly updates " })
    expect(nodes[1]).toEqual({ type: "wikilink", target: "", alias: undefined, isEmbed: true })
  })

  // ── Bare URLs ───────────────────────────────────────────────────────────

  it("parses bare URLs", () => {
    const nodes = parseInlineText("visit https://example.com/path today")
    expect(types(nodes)).toEqual(["plain", "bareurl", "plain"])
    expect(nodes[1]).toEqual({ type: "bareurl", url: "https://example.com/path" })
  })

  it("parses autolinks <URL>", () => {
    const nodes = parseInlineText("see <https://example.com> here")
    expect(types(nodes)).toEqual(["plain", "bareurl", "plain"])
    expect(nodes[1]).toEqual({ type: "bareurl", url: "https://example.com" })
  })

  // ── Inline fields ──────────────────────────────────────────────────────

  it("parses bracketed inline fields", () => {
    const nodes = parseInlineText("[due:: 2024-01-15]")
    expect(nodes).toEqual([{ type: "field", key: "due", value: "2024-01-15" }])
  })

  it("parses bare key:: value properties", () => {
    const nodes = parseInlineText("Task created:: 2024-01-15 due:: 2024-02-01")
    expect(types(nodes)).toEqual(["plain", "field", "plain", "field"])
  })

  // ── Block references ────────────────────────────────────────────────────

  it("block ID suffix is stripped by kmast transform", () => {
    // kmBlockIdTransform strips " ^blockId" from text and stores in node.data.blockId
    // So the inline parser sees only "Task" — the block ID is metadata, not display text
    const nodes = parseInlineText("Task ^1201889996442258")
    expect(types(nodes)).toEqual(["plain"])
    expect(nodes[0]).toEqual({ type: "plain", text: "Task" })
  })

  it("parses block ref wikilink [[^GID]]", () => {
    const nodes = parseInlineText("[[^1201889996442258]]")
    expect(nodes).toEqual([{ type: "wikilink", target: "", alias: undefined, isEmbed: false }])
  })

  // ── Formatting ──────────────────────────────────────────────────────────

  it("parses bold", () => {
    const nodes = parseInlineText("this is **bold** text")
    expect(types(nodes)).toEqual(["plain", "bold", "plain"])
    const bold = nodes[1] as Extract<InlineNode, { type: "bold" }>
    expect(bold.children).toEqual([{ type: "plain", text: "bold" }])
  })

  it("parses italic (asterisk)", () => {
    const nodes = parseInlineText("this is *italic* text")
    expect(types(nodes)).toEqual(["plain", "italic", "plain"])
  })

  it("parses italic (underscore)", () => {
    const nodes = parseInlineText("this is _italic_ text")
    expect(types(nodes)).toEqual(["plain", "italic", "plain"])
  })

  it("parses strikethrough", () => {
    const nodes = parseInlineText("this is ~~deleted~~ text")
    expect(types(nodes)).toEqual(["plain", "strikethrough", "plain"])
  })

  it("parses nested bold+italic", () => {
    const nodes = parseInlineText("**bold *italic* text**")
    expect(types(nodes)).toEqual(["bold"])
    const bold = nodes[0] as Extract<InlineNode, { type: "bold" }>
    expect(bold.children.length).toBe(3)
    expect(bold.children[0]).toEqual({ type: "plain", text: "bold " })
    expect(bold.children[1]).toEqual({ type: "italic", children: [{ type: "plain", text: "italic" }] })
    expect(bold.children[2]).toEqual({ type: "plain", text: " text" })
  })

  // ── Sigils ──────────────────────────────────────────────────────────────

  it("parses @mentions", () => {
    const nodes = parseInlineText("assigned to @bjørn-stabell")
    expect(types(nodes)).toEqual(["plain", "mention"])
    expect(nodes[1]).toEqual({ type: "mention", name: "bjørn-stabell" })
  })

  it("parses #tags", () => {
    const nodes = parseInlineText("tagged #urgent")
    expect(types(nodes)).toEqual(["plain", "tag"])
    expect(nodes[1]).toEqual({ type: "tag", name: "urgent" })
  })

  it("parses +projects", () => {
    const nodes = parseInlineText("in +launch-academy")
    expect(types(nodes)).toEqual(["plain", "project"])
    expect(nodes[1]).toEqual({ type: "project", name: "launch-academy" })
  })

  it("parses multiple sigils", () => {
    const nodes = parseInlineText("@user #tag +project")
    expect(types(nodes)).toEqual(["mention", "plain", "tag", "plain", "project"])
  })

  // ── Complex combinations ────────────────────────────────────────────────

  it("parses real Asana heading with embed ref", () => {
    const nodes = parseInlineText("Monthly investor updates to LA ![[^1201889996442258]]")
    expect(types(nodes)).toEqual(["plain", "wikilink"])
    expect(nodes[0]).toEqual({ type: "plain", text: "Monthly investor updates to LA " })
    expect(nodes[1]).toEqual({ type: "wikilink", target: "", alias: undefined, isEmbed: true })
  })

  it("parses heading with sigils and properties", () => {
    const nodes = parseInlineText("Submit PR Application @bjørn-stabell +canada created:: 2022-02-09")
    const typeList = types(nodes)
    expect(typeList).toContain("mention")
    expect(typeList).toContain("project")
    expect(typeList).toContain("field")
  })

  it("code inside bold is correctly nested", () => {
    // mdast correctly parses code inside bold as nested children
    const nodes = parseInlineText("**use `code` here**")
    expect(types(nodes)).toEqual(["bold"])
    const bold = nodes[0] as { type: "bold"; children: { type: string }[] }
    expect(bold.children.map((c) => c.type)).toEqual(["plain", "code", "plain"])
  })

  it("parses link followed by mention", () => {
    const nodes = parseInlineText("[Read more](https://example.com) @author")
    expect(types(nodes)).toEqual(["link", "plain", "mention"])
  })
})

describe("inlineNodesToPlainText", () => {
  it("flattens plain text", () => {
    expect(inlineNodesToPlainText(parseInlineText("hello world"))).toBe("hello world")
  })

  it("flattens bold text", () => {
    expect(inlineNodesToPlainText(parseInlineText("**bold** text"))).toBe("bold text")
  })

  it("flattens links", () => {
    expect(inlineNodesToPlainText(parseInlineText("[label](url)"))).toBe("label")
  })

  it("strips block refs and fields from plain text", () => {
    const text = "Monthly updates ![[^1234567890]]"
    expect(inlineNodesToPlainText(parseInlineText(text))).toBe("Monthly updates ")
  })

  it("preserves sigils in plain text", () => {
    expect(inlineNodesToPlainText(parseInlineText("@user #tag"))).toBe("@user #tag")
  })

  it("extracts wiki link alias", () => {
    expect(inlineNodesToPlainText(parseInlineText("[[target|alias]]"))).toBe("alias")
  })
})

import { describe, expect, it } from "vitest"
import { fromMarkdown } from "mdast-util-from-markdown"
import { kmWikilink, kmWikilinkFromMarkdown } from "../../src/extensions/km-wikilink.ts"
import type { KmWikilink } from "../../src/kmast/types.ts"

function parse(md: string) {
  return fromMarkdown(md, {
    extensions: [kmWikilink()],
    mdastExtensions: [kmWikilinkFromMarkdown()],
  })
}

function findWikilinks(tree: any): KmWikilink[] {
  const links: KmWikilink[] = []
  function walk(node: any) {
    if (node.type === "kmWikilink") links.push(node)
    if (node.children) node.children.forEach(walk)
  }
  walk(tree)
  return links
}

describe("km-wikilink", () => {
  it("simple: [[target]]", () => {
    const tree = parse("[[target]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "target",
      embedded: false,
    })
    expect(links[0]!.section).toBeUndefined()
    expect(links[0]!.blockRef).toBeUndefined()
    expect(links[0]!.alias).toBeUndefined()
  })

  it("with alias: [[target|display]]", () => {
    const tree = parse("[[target|display]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "target",
      alias: "display",
      embedded: false,
    })
  })

  it("embed: ![[image.png]]", () => {
    const tree = parse("![[image.png]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "image.png",
      embedded: true,
    })
  })

  it("with section: [[page#heading]]", () => {
    const tree = parse("[[page#heading]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "page",
      section: "heading",
      embedded: false,
    })
    expect(links[0]!.blockRef).toBeUndefined()
  })

  it("with blockRef: [[page#^abc123]]", () => {
    const tree = parse("[[page#^abc123]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "page",
      blockRef: "abc123",
      embedded: false,
    })
    expect(links[0]!.section).toBeUndefined()
  })

  it("section + blockRef: [[page#heading#^block]]", () => {
    const tree = parse("[[page#heading#^block]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "page",
      section: "heading",
      blockRef: "block",
      embedded: false,
    })
  })

  it("same-file section ref: [[#heading]]", () => {
    const tree = parse("[[#heading]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "",
      section: "heading",
      embedded: false,
    })
  })

  it("same-file blockRef: [[^block]]", () => {
    const tree = parse("[[^block]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "",
      blockRef: "block",
      embedded: false,
    })
  })

  it("multiple wikilinks in one paragraph", () => {
    const tree = parse("See [[foo]] and [[bar|baz]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({ target: "foo", embedded: false })
    expect(links[1]).toMatchObject({ target: "bar", alias: "baz", embedded: false })
  })

  it("wikilink with spaces in target: [[My Page]]", () => {
    const tree = parse("[[My Page]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "My Page",
      embedded: false,
    })
  })

  it("embed with alias: ![[image.png|caption]]", () => {
    const tree = parse("![[image.png|caption]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "image.png",
      alias: "caption",
      embedded: true,
    })
  })

  it("not a wikilink: single brackets [not a link]", () => {
    const tree = parse("[not a link]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(0)
  })

  it("relative embed: ![[./child]]", () => {
    const tree = parse("![[./child]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "child",
      embedded: true,
      relative: true,
    })
  })

  it("relative link: [[./sibling]]", () => {
    const tree = parse("[[./sibling]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      type: "kmWikilink",
      target: "sibling",
      embedded: false,
      relative: true,
    })
  })

  it("relative with section: [[./page#heading]]", () => {
    const tree = parse("[[./page#heading]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "page",
      section: "heading",
      relative: true,
    })
  })

  it("relative with alias: ![[./child|Display Name]]", () => {
    const tree = parse("![[./child|Display Name]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "child",
      alias: "Display Name",
      embedded: true,
      relative: true,
    })
  })

  it("non-relative embed does not set relative flag", () => {
    const tree = parse("![[other]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(1)
    expect(links[0]!.relative).toBeUndefined()
  })

  // Regression: multi-line wikilinks caused micromark subtokenizer crash
  // (RangeError in splice-buffer when content spanned 3+ lines)
  it("multi-line wikilink does not crash", () => {
    const tree = parse("![[file#heading\n-- line2\n-- line3\n+- line4]]")
    // Should parse without throwing; multi-line content is not a valid wikilink
    const links = findWikilinks(tree)
    expect(links).toHaveLength(0)
  })

  it("two-line wikilink is rejected gracefully", () => {
    const tree = parse("![[file#a\nb]]")
    const links = findWikilinks(tree)
    expect(links).toHaveLength(0)
  })

  it("wikilink with embedded code block does not crash", () => {
    const md = "![[file#section\n```ts\nconst x = 1\n```\nmore]]"
    const tree = parse(md)
    const links = findWikilinks(tree)
    expect(links).toHaveLength(0)
  })
})

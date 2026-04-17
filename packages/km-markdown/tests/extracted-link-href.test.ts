import { describe, expect, test } from "vitest"
import { parseMarkdownWithLinks } from "../src/ast2nodes.ts"

function hrefsFor(md: string): string[] {
  const result = parseMarkdownWithLinks(md, "test.md")
  return result.wikilinks.map((w) => w.href)
}

describe("ExtractedLink.href — Phase 2 wiring", () => {
  test("plain wikilink → km:Name", () => {
    expect(hrefsFor("# Note\n\nSee [[Alice]].")).toEqual(["km:Alice"])
  })

  test("hierarchical wikilink → km:Path/Segment", () => {
    expect(hrefsFor("# Note\n\nSee [[Project/Alpha]].")).toEqual(["km:Project/Alpha"])
  })

  test("wikilink with section → km:Name#Section", () => {
    expect(hrefsFor("# Note\n\nSee [[Alice#Meeting]].")).toEqual(["km:Alice#Meeting"])
  })

  test("wikilink with block → km:Name#^block", () => {
    expect(hrefsFor("# Note\n\nSee [[Alice^abc123]].")).toEqual(["km:Alice#^abc123"])
  })

  test("embedded wikilink keeps href shape (rel differs, href same)", () => {
    expect(hrefsFor("# Note\n\n![[Alice]]")).toEqual(["km:Alice"])
  })

  test("sigil-prefixed wiki target → km:@Alice", () => {
    expect(hrefsFor("# Note\n\nSee [[@Alice]].")).toEqual(["km:@Alice"])
  })

  test("sigil-prefixed # wiki target → self-ref (special case)", () => {
    // [[#Section]] in wiki form is self-ref per design.
    expect(hrefsFor("# Note\n\nSee [[#Section]].")).toEqual(["#Section"])
  })

  test("all extracted links carry an href (never undefined)", () => {
    const result = parseMarkdownWithLinks("# A\n\n[[B]] and [[C]] and ![[D]]", "a.md")
    expect(result.wikilinks.length).toBe(3)
    for (const w of result.wikilinks) {
      expect(typeof w.href).toBe("string")
      expect(w.href.length).toBeGreaterThan(0)
    }
  })
})

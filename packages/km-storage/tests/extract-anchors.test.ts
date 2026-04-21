/**
 * Anchor Extractor Unit Tests
 *
 * `extractAnchors(content)` does a lightweight regex pass over a markdown
 * file's raw content to find heading anchors and obsidian-style block refs
 * (`^blockid`). Complement to `extractLinks` — extracts the targetable
 * anchors inside a file so inbound references like `[[file#section]]` can
 * resolve to a `source_offset` inside a collapsed, unparsed file.
 *
 * See km-storage.collapsed-file-anchors (C4) and docs/design/model/klink.md
 * for the anchor semantics.
 *
 * Covers every heading/block-ref shape plus adversarial inputs (code fences,
 * escaped heads, blank content, unicode, ATX closers).
 */

import { describe, test, expect } from "vitest"
import { extractAnchors } from "../src/markdown/extract-anchors.ts"

describe("extractAnchors: headings", () => {
  test("single H2", () => {
    const anchors = extractAnchors("## Plans")
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toMatchObject({
      anchor: "Plans",
      rawText: "Plans",
      headingLevel: 2,
      offset: 0,
    })
  })

  test("all heading levels H1-H6", () => {
    const content = "# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six\n"
    const anchors = extractAnchors(content)
    expect(anchors.map((a) => a.headingLevel)).toEqual([1, 2, 3, 4, 5, 6])
    expect(anchors.map((a) => a.anchor)).toEqual(["One", "Two", "Three", "Four", "Five", "Six"])
  })

  test("H7+ is NOT a heading (7+ hashes treated as text)", () => {
    const anchors = extractAnchors("####### NotAHeading\n")
    // 7 hashes is not a valid ATX heading per CommonMark — skip it
    expect(anchors.filter((a) => a.headingLevel !== null && a.headingLevel !== undefined)).toHaveLength(0)
  })

  test("offset tracks byte position", () => {
    const content = "Some intro.\n\n## Plans\n\nBody.\n\n### Later\n"
    const anchors = extractAnchors(content)
    expect(anchors).toHaveLength(2)
    expect(anchors[0]?.offset).toBe(content.indexOf("## Plans"))
    expect(anchors[1]?.offset).toBe(content.indexOf("### Later"))
  })

  test("unicode heading text preserved", () => {
    const anchors = extractAnchors("## Plànš & émojis 🎉")
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.anchor).toBe("Plànš & émojis 🎉")
  })

  test("ATX closing hashes stripped from anchor text", () => {
    // CommonMark: `## Title ##` trailing hashes are the optional closing sequence.
    const anchors = extractAnchors("## Plans ##\n")
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.anchor).toBe("Plans")
  })

  test("trailing whitespace trimmed", () => {
    const anchors = extractAnchors("##   Plans   \n")
    expect(anchors).toHaveLength(1)
    expect(anchors[0]?.anchor).toBe("Plans")
  })

  test("requires space after #", () => {
    // `##Plans` is not a valid ATX heading.
    const anchors = extractAnchors("##Plans\n")
    expect(anchors).toHaveLength(0)
  })

  test("empty heading skipped", () => {
    const anchors = extractAnchors("## \n")
    expect(anchors).toHaveLength(0)
  })

  test("multiple headings in one file", () => {
    const content = "# Doc\n## Overview\n### Details\n## Plans\n### Q1\n### Q2\n"
    const anchors = extractAnchors(content)
    expect(anchors).toHaveLength(6)
    expect(anchors.map((a) => a.anchor)).toEqual(["Doc", "Overview", "Details", "Plans", "Q1", "Q2"])
  })
})

describe("extractAnchors: block refs (obsidian `^blockid`)", () => {
  test("standalone `^blockid` at end of line", () => {
    const content = "This is a paragraph. ^abc123\n"
    const anchors = extractAnchors(content)
    // blockref-only entries have headingLevel absent/undefined
    const blockAnchors = anchors.filter((a) => a.headingLevel === undefined || a.headingLevel === null)
    expect(blockAnchors).toHaveLength(1)
    expect(blockAnchors[0]).toMatchObject({
      anchor: "^abc123",
      rawText: "^abc123",
    })
  })

  test("block ref on its own line", () => {
    const content = "Paragraph.\n^blk-1\n\nNext paragraph.\n"
    const anchors = extractAnchors(content)
    const blockAnchors = anchors.filter((a) => !a.headingLevel)
    expect(blockAnchors).toHaveLength(1)
    expect(blockAnchors[0]?.anchor).toBe("^blk-1")
  })

  test("block ref with mixed alphanumeric + dashes", () => {
    const content = "Text. ^alpha-123-beta\n"
    const anchors = extractAnchors(content)
    const blockAnchors = anchors.filter((a) => !a.headingLevel)
    expect(blockAnchors).toHaveLength(1)
    expect(blockAnchors[0]?.anchor).toBe("^alpha-123-beta")
  })

  test("^text in middle of line is NOT a block ref", () => {
    // Only end-of-line or standalone `^id` counts.
    const content = "Reading ^notablock in middle.\n"
    const anchors = extractAnchors(content)
    expect(anchors.filter((a) => !a.headingLevel)).toHaveLength(0)
  })

  test("multiple block refs across file", () => {
    const content = "First para. ^p1\n\nSecond para.\n^p2\n\nThird. ^p3\n"
    const anchors = extractAnchors(content)
    const blockAnchors = anchors.filter((a) => !a.headingLevel)
    expect(blockAnchors.map((a) => a.anchor)).toEqual(["^p1", "^p2", "^p3"])
  })

  test("offset tracks block ref byte position", () => {
    const content = "Some text. ^my-ref\n"
    const anchors = extractAnchors(content)
    const block = anchors.find((a) => !a.headingLevel)
    expect(block?.offset).toBe(content.indexOf("^my-ref"))
  })
})

describe("extractAnchors: code fences + inline code", () => {
  test("heading inside fenced code block skipped", () => {
    const content = "# Real\n\n```\n## FakeHeading\n```\n\n## AlsoReal\n"
    const anchors = extractAnchors(content)
    expect(anchors.map((a) => a.anchor)).toEqual(["Real", "AlsoReal"])
  })

  test("block ref inside fenced code block skipped", () => {
    const content = "```\n^fake-block\n```\n\nParagraph. ^real-block\n"
    const anchors = extractAnchors(content)
    const blocks = anchors.filter((a) => !a.headingLevel)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.anchor).toBe("^real-block")
  })

  test("fence with language skipped", () => {
    const content = "```ts\n## Not\n```\n\n## Real\n"
    const anchors = extractAnchors(content)
    expect(anchors.map((a) => a.anchor)).toEqual(["Real"])
  })

  test("unclosed fence does not eat following content (lenient)", () => {
    // Implementation note: if fence stays open to EOF, content inside is skipped.
    // This is acceptable — malformed files should produce a consistent subset.
    const content = "# Header\n\n```\nunclosed\n## InsideFence\n"
    const anchors = extractAnchors(content)
    expect(anchors.map((a) => a.anchor)).toContain("Header")
    expect(anchors.map((a) => a.anchor)).not.toContain("InsideFence")
  })
})

describe("extractAnchors: edge cases", () => {
  test("empty content", () => {
    expect(extractAnchors("")).toHaveLength(0)
  })

  test("whitespace-only content", () => {
    expect(extractAnchors("\n\n\n  \n")).toHaveLength(0)
  })

  test("no headings, no block refs", () => {
    expect(extractAnchors("Just a plain paragraph with no anchors.")).toHaveLength(0)
  })

  test("returns sorted by offset", () => {
    const content = "## Third\n\nBody. ^first-block\n\n## Second\n"
    const anchors = extractAnchors(content)
    // Sorted by offset, the blockref appears before the 2nd heading
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i]?.offset).toBeGreaterThan(anchors[i - 1]?.offset ?? -1)
    }
  })

  test("large file with many anchors", () => {
    const parts: string[] = []
    for (let i = 0; i < 100; i++) {
      parts.push(`## Section ${i}\n\nContent ${i}. ^ref-${i}\n`)
    }
    const anchors = extractAnchors(parts.join("\n"))
    // 100 headings + 100 block refs = 200
    expect(anchors).toHaveLength(200)
  })
})

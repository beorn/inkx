import { describe, expect, test } from "vitest"
import { detectReferences } from "../src/detection.ts"
import { parseBlocks, parseInline } from "../src/markdown.ts"

describe("detection", () => {
  test("finds bead ids, file paths, urls, and code refs", () => {
    const text = "See km-silvercode.m0-harness-skeleton — also apps/silvercode/src/App.tsx:42 and https://silvery.dev"
    const d = detectReferences(text)
    const kinds = d.map((x) => x.kind)
    expect(kinds).toContain("bead")
    expect(kinds).toContain("code-ref")
    expect(kinds).toContain("url")
  })

  test("non-overlapping", () => {
    const text = "bd:km-silvercode.m1 /Users/me/foo.ts:5 https://example.com"
    const d = detectReferences(text)
    let cursor = -1
    for (const det of d) {
      expect(det.start).toBeGreaterThanOrEqual(cursor)
      cursor = det.end
    }
  })
})

describe("markdown tokenizer", () => {
  test("splits headings, paragraphs, lists, code fences", () => {
    const md = [
      "# Title",
      "",
      "Some **bold** intro text.",
      "",
      "- one",
      "- two",
      "",
      "```ts",
      "const x = 1",
      "```",
    ].join("\n")
    const blocks = parseBlocks(md)
    const kinds = blocks.map((b) => b.kind)
    expect(kinds).toContain("heading")
    expect(kinds).toContain("paragraph")
    expect(kinds).toContain("bullet")
    expect(kinds).toContain("code")
  })

  test("parses inline bold + code + link", () => {
    const tokens = parseInline("a **b** `c` [d](https://x.dev) e")
    const kinds = tokens.map((t) => t.kind)
    expect(kinds).toContain("bold")
    expect(kinds).toContain("code")
    expect(kinds).toContain("link")
  })

  test("parses pipe tables with alignment separators", () => {
    const md = [
      "| a | b |",
      "|---|---:|",
      "| 1 | 2 |",
      "| 3 | 4 |",
    ].join("\n")
    const blocks = parseBlocks(md)
    expect(blocks).toHaveLength(1)
    const t = blocks[0]!
    expect(t.kind).toBe("table")
    if (t.kind !== "table") return
    expect(t.headers).toEqual(["a", "b"])
    expect(t.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ])
    expect(t.alignments).toEqual([null, "right"])
  })
})

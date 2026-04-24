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
    const md = ["| a | b |", "|---|---:|", "| 1 | 2 |", "| 3 | 4 |"].join("\n")
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

  // Edge cases that the previous regex tokenizer got wrong — these verify
  // we've switched to a real mdast-backed parser.
  test("nested emphasis: **_bold italic_** doesn't leak asterisks", () => {
    const tokens = parseInline("prefix **_bold italic_** suffix")
    // Must contain a bold token whose text has no stray asterisks / underscores.
    const bold = tokens.find((t) => t.kind === "bold")
    expect(bold).toBeTruthy()
    if (!bold || bold.kind !== "bold") return
    expect(bold.text).not.toMatch(/[*_]/)
    expect(bold.text.trim()).toBe("bold italic")
    // Surrounding text should still be present.
    const joined = tokens.map((t) => ("text" in t ? t.text : "")).join("")
    expect(joined).toMatch(/prefix/)
    expect(joined).toMatch(/suffix/)
  })

  test("fenced code block inside a list item", () => {
    const md = [
      "- before",
      "- item with code:",
      "  ```ts",
      "  const x = 1",
      "  ```",
      "- after",
    ].join("\n")
    const blocks = parseBlocks(md)
    const kinds = blocks.map((b) => b.kind)
    expect(kinds).toContain("code")
    const codeBlock = blocks.find((b) => b.kind === "code")
    expect(codeBlock).toBeTruthy()
    if (!codeBlock || codeBlock.kind !== "code") return
    expect(codeBlock.language).toBe("ts")
    expect(codeBlock.code).toContain("const x = 1")
    // The bullets surrounding the code still need to render.
    const bullets = blocks.filter((b) => b.kind === "bullet")
    expect(bullets.length).toBeGreaterThanOrEqual(3)
  })

  test("table with inline code + bold inside cells", () => {
    const md = [
      "| name | value |",
      "|------|-------|",
      "| `a`  | **hi** |",
      "| b    | _em_   |",
    ].join("\n")
    const blocks = parseBlocks(md)
    const t = blocks.find((b) => b.kind === "table")
    expect(t).toBeTruthy()
    if (!t || t.kind !== "table") return
    expect(t.headers).toEqual(["name", "value"])
    // Cells flatten inline formatting to plain text — the important thing is
    // the cell's visible text survives the table projection.
    expect(t.rows[0]?.[0]).toBe("a")
    expect(t.rows[0]?.[1]).toBe("hi")
    expect(t.rows[1]?.[1]).toBe("em")
  })

  test("streaming partial: unclosed bold degrades gracefully", () => {
    // Parser must not throw and must still surface the text. The fallback is
    // allowed — all we require is a non-empty, synchronous result.
    const blocks = parseBlocks("Writing **unclosed bold and continuing…")
    expect(blocks.length).toBeGreaterThan(0)
    const text = blocks
      .map((b) => ("text" in b ? b.text : "code" in b ? b.code : ""))
      .join(" ")
    expect(text).toMatch(/unclosed bold/)
  })

  test("ordered list with nested bullets preserves depth", () => {
    const md = ["1. first", "   - nested a", "   - nested b", "2. second"].join("\n")
    const blocks = parseBlocks(md)
    const ordered = blocks.filter((b) => b.kind === "ordered")
    const bullets = blocks.filter((b) => b.kind === "bullet")
    expect(ordered).toHaveLength(2)
    expect(bullets).toHaveLength(2)
    // Nested bullets must have depth > ordered's depth.
    for (const b of bullets) {
      expect(b.kind === "bullet" && b.depth).toBeGreaterThan(0)
    }
  })
})

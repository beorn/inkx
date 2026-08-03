/**
 * MarkdownView — minimal Markdown renderer.
 *
 * The load-bearing behavior is paragraph REFLOW: authored hard-wraps inside a
 * paragraph join into one logical line and re-wrap to the container width — the
 * terminal, not the author, decides where lines break. Plus emphasis / inline
 * code / heading / list styling via Typography presets + semantic tokens
 * (`strong`→bold, `em`→italic, `code`→`$fg-info`, headings bold).
 *
 * Assertions render the buffer and check what the user sees (The Silvery Way
 * §10); one parser unit test pins the reflow join at the source. Runs at
 * SILVERY_STRICT=2 (default test setup) — incremental renders must match fresh.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Content, DocumentView, MarkdownView, Text, type DocumentBlock } from "silvery"
import { parseMarkdownBlocks } from "../../packages/ag-react/src/ui/components/MarkdownView"

const DEFAULT_WIDTH = 80

// Pin the root width so the column → row → <Text wrap="wrap"> chain reflows to a
// real width instead of collapsing to max-content (silvery CLAUDE.md testing
// note: createRenderer passes cols as *available* width, not root.style.width).
function render(source: string, width = DEFAULT_WIDTH) {
  const r = createRenderer({ cols: width, rows: 24 })
  return r(
    <Box width={width} height={24}>
      <MarkdownView source={source} />
    </Box>,
  )
}

function renderDocument(blocks: readonly DocumentBlock[], width: number) {
  const r = createRenderer({ cols: width, rows: 24 })
  return r(
    <Box width={width} height={24}>
      <Content.Layout fill={false} prose="100%" align="start">
        <DocumentView blocks={blocks} />
      </Content.Layout>
    </Box>,
  )
}

describe("MarkdownView — paragraph reflow", () => {
  test("joins authored hard-wraps and reflows to the container width", () => {
    const source = "This is a long paragraph that the author\nhard-wrapped across two short lines."
    const app = render(source, 80)
    // At width 80 the joined line fits on one row: the authored newline became a
    // space, so the two authored halves sit contiguously.
    expect(app.text).toContain("author hard-wrapped")
  })

  test("re-wraps to a narrow width without losing or reordering words", () => {
    const source = "This is a long paragraph that the author\nhard-wrapped across two short lines."
    const app = render(source, 30)
    const lines = app.text.split("\n").filter((line) => line.trim() !== "")
    expect(lines.length).toBeGreaterThan(1) // forced to wrap at 30 cols
    // Every word survives, in order, re-wrapped at width boundaries (not the
    // authored ones).
    expect(app.text.replace(/\s+/gu, " ").trim()).toContain(
      "This is a long paragraph that the author hard-wrapped across two short lines.",
    )
  })

  test("parseMarkdownBlocks joins wrapped paragraph lines with a space", () => {
    const blocks = parseMarkdownBlocks("alpha beta\ngamma delta")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: "paragraph", text: "alpha beta gamma delta" })
  })

  test("a blank line separates two paragraphs", () => {
    const blocks = parseMarkdownBlocks("one two\n\nthree four")
    expect(blocks.map((block) => (block.kind === "paragraph" ? block.text : block.kind))).toEqual([
      "one two",
      "three four",
    ])
  })
})

describe("MarkdownView — inline emphasis (Typography presets)", () => {
  test("**bold** renders bold and strips the markers", () => {
    const app = render("**Bold** text")
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("B")
    expect(cell.bold).toBe(true)
    expect(app.text).toContain("Bold")
    expect(app.text).not.toContain("**")
  })

  test("*italic* renders italic and strips the markers", () => {
    const app = render("*Emphasis* here")
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("E")
    expect(cell.italic).toBe(true)
    expect(app.text).not.toContain("*")
  })

  test("`inline code` renders as unpadded $fg-info prose and strips the backticks", () => {
    const app = render("run `bun fix` now")
    expect(app.text).toContain("bun fix")
    expect(app.text).not.toContain("`")
    // "run " is cols 0-3; inline code begins immediately at col 4.
    const codeCell = app.cell(4, 0)
    const expected = createRenderer({ cols: 10, rows: 1 })(<Text color="$fg-info">b</Text>).cell(0, 0)
    expect(codeCell.char).toBe("b")
    expect(expected.fg).not.toBeNull()
    expect(codeCell.fg).toEqual(expected.fg)
    expect(codeCell.bg).toBeNull()
  })
})

describe("MarkdownView — block elements", () => {
  test("# heading renders bold and strips the hashes", () => {
    const app = render("# Title\n\nBody text")
    const cell = app.cell(0, 0)
    expect(cell.char).toBe("T")
    expect(cell.bold).toBe(true)
    expect(app.text).toContain("Title")
    expect(app.text).toContain("Body text")
    expect(app.text).not.toContain("#")
  })

  test("bullet list renders one marked row per item", () => {
    const app = render("- Apple\n- Banana\n- Cherry")
    expect(app.text).toContain("• Apple")
    expect(app.text).toContain("• Banana")
    expect(app.text).toContain("• Cherry")
    expect(app.text).not.toMatch(/^-\s/mu) // raw dash marker gone
  })

  test("ordered list renders sequential numbers", () => {
    const app = render("1. First\n2. Second\n3. Third")
    expect(app.text).toContain("1. First")
    expect(app.text).toContain("2. Second")
    expect(app.text).toContain("3. Third")
  })

  test("list item text reflows under a hanging indent", () => {
    const source = "- This single bullet item was authored\n  wrapped onto a second physical line."
    const blocks = parseMarkdownBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: "list" })
    if (blocks[0]?.kind === "list") {
      expect(blocks[0].list.items[0]?.text).toBe(
        "This single bullet item was authored wrapped onto a second physical line.",
      )
    }
  })

  test("fenced code preserves line breaks and does not reflow", () => {
    const app = render("```ts\nconst a = 1\nconst b = 2\n```")
    expect(app.text).toContain("const a = 1")
    expect(app.text).toContain("const b = 2")
    expect(app.text).not.toContain("const a = 1 const b = 2") // stayed on two lines
    expect(app.text).not.toContain("```") // fence markers stripped
  })
})

describe("DocumentView — shared document geometry", () => {
  test("ordered counters advance while every body shares one hanging-indent column", () => {
    const list = {
      groupId: "steps",
      depth: 0,
      ordered: true,
      start: 9,
    } as const
    const app = renderDocument(
      [
        { id: "step-9", kind: "list-item", list, content: "Nine" },
        {
          id: "step-10",
          kind: "list-item",
          list,
          content: "Ten has enough words to wrap at this narrow width",
        },
        { id: "step-11", kind: "list-item", list, content: "Eleven" },
      ],
      24,
    )
    const lines = app.text.split("\n")
    const nine = lines.findIndex((line) => line.includes("9."))
    const ten = lines.findIndex((line) => line.includes("10."))
    const eleven = lines.findIndex((line) => line.includes("11."))
    const continuation = lines.findIndex((line) => line.includes("wrap at"))

    expect(nine).toBeGreaterThanOrEqual(0)
    expect(ten).toBeGreaterThan(nine)
    expect(eleven).toBeGreaterThan(ten)
    expect(continuation).toBeGreaterThan(ten)
    expect(lines[nine]?.indexOf("Nine")).toBe(lines[ten]?.indexOf("Ten"))
    expect(lines[ten]?.indexOf("Ten")).toBe(lines[eleven]?.indexOf("Eleven"))
    expect(lines[continuation]?.search(/\S/u)).toBe(lines[ten]?.indexOf("Ten"))
  })

  test("tight list rows stay adjacent and leave block rhythm before following prose", () => {
    const list = {
      groupId: "bullets",
      depth: 0,
      ordered: false,
    } as const
    const app = renderDocument(
      [
        { id: "alpha", kind: "list-item", list, content: "Alpha" },
        { id: "beta", kind: "list-item", list, content: "Beta" },
        { id: "after", kind: "paragraph", content: "After the list" },
      ],
      32,
    )
    const lines = app.text.split("\n")
    const alpha = lines.findIndex((line) => line.includes("Alpha"))
    const beta = lines.findIndex((line) => line.includes("Beta"))
    const after = lines.findIndex((line) => line.includes("After the list"))

    expect(beta).toBe(alpha + 1)
    expect(after).toBe(beta + 2)
    expect(lines[alpha]).toMatch(/•\s+Alpha/u)
    expect(lines[beta]).toMatch(/•\s+Beta/u)
  })
})

describe("MarkdownView — realistic PR description", () => {
  test("reflows the body, renders the list, and styles bold — no raw markers", () => {
    const source = [
      "Refactors the queue admission path so submissions",
      "and check-requests share one causal clock.",
      "",
      "Key changes:",
      "",
      "- **Dedupe** the trailing issue line",
      "- Reflow paragraphs to the pane width",
      "",
      "Issue: @yrd/core/21096",
    ].join("\n")
    const app = render(source, 80)
    expect(app.text).toContain("submissions and check-requests") // paragraph reflow
    expect(app.text).toContain("• ") // list rendered
    expect(app.text).toContain("Dedupe") // bold content present
    expect(app.text).toContain("Issue: @yrd/core/21096") // trailer preserved verbatim
    expect(app.text).not.toContain("**") // emphasis markers stripped
  })
})

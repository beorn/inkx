/**
 * Markdown rendering bugs — bullet spacing, URL+colon flow, bold/italic.
 *
 * Reproduces three regressions reported as `km-silvercode.markdown-render-bugs`:
 *
 * A. Inconsistent bullet spacing — some bullets render `• Content` (correct),
 *    others render `•Content` (no space). Same paste, same render path.
 *
 * B. Stray colon on its own line after a URL — `…github.com/beorn/bearly`
 *    gets newline + `: alien-projections…` instead of flowing inline.
 *
 * C. No bold/italic styling — `**bold**` and `*italic*` segments render as
 *    plain prose with no visible bold/italic styling on cells.
 *
 * The test renders a single static `<MarkdownView>` through `createRenderer`
 * (no App harness needed — these bugs live in MarkdownView/markdown.ts) at
 * a width that mirrors the SessionCard (cols - sidepanel - chrome).
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Prose } from "silvery"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"

const COLS = 80
const ROWS = 60

// Mirror the SessionCard/AssistantBlock chain so wrap math matches production.
function Frame({ source }: { source: string }): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Prose flexGrow={1}>
        <MarkdownView source={source} />
      </Prose>
    </Box>
  )
}

describe("markdown rendering bugs", () => {
  test("A: every bullet renders with a space after the glyph", () => {
    // Five bullets of varying length: some short enough to fit on one line,
    // some long enough to wrap. The reported bug pattern was alternating —
    // odd-index bullets glued (•Content), even-index kept the space. The
    // bug surfaces when bullet text WRAPS at the available width — a
    // narrow width (40 cols) reliably reproduces it.
    const source = [
      "- Monorepo with vendored submodules under vendor/",
      "- Internal docs in hub/ (private workspace, not shipped)",
      "- Issue tracking via beads stored in .beads/dolt-server with a Dolt DB",
      "- Code style: factory functions, using cleanup, async generators, no classes",
      "- State machines as (action, state) -> [state, effects], serializable",
    ].join("\n")
    const cols = 40
    const render = createRenderer({ cols, rows: ROWS })
    const app = render(
      <Box width={cols} height={ROWS} flexDirection="column">
        <Prose flexGrow={1}>
          <MarkdownView source={source} />
        </Prose>
      </Box>,
    )

    // Every line that starts with `•` (after leading whitespace) must have a
    // space immediately after the glyph. The bug shape was `•Issue`, `•Code`,
    // `•State` — i.e. `•` directly followed by a letter.
    const offendingLines = app.lines.filter((line) => /•[^\s]/.test(line))
    expect(
      offendingLines,
      `bullets without trailing space:\n${offendingLines.join("\n")}\n\nfull frame:\n${app.text}`,
    ).toEqual([])

    // Sanity: at least one bullet glyph must actually render.
    expect(app.text, "no bullet glyphs rendered").toMatch(/•/)
  })

  test("B: URL followed by colon flows inline (no orphan colon line)", () => {
    const source =
      "Sibling reactive primitives at github.com/beorn/bearly: alien-projections, alien-resources, alien-trees - built on upstream alien-signals."
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Frame source={source} />)

    // The bug shape was a line that consists of just `:` plus optional whitespace
    // (the colon stranded on its own line after the URL).
    const orphanColonLine = app.lines.find((line) => /^\s*:\s*\S/.test(line))
    expect(
      orphanColonLine,
      `colon stranded on its own line:\n  "${orphanColonLine}"\n\nfull frame:\n${app.text}`,
    ).toBeUndefined()

    // The URL and the colon must appear on the same visual line.
    const urlLineIdx = app.lines.findIndex((line) => line.includes("github.com/beorn/bearly"))
    expect(urlLineIdx, "URL not rendered").toBeGreaterThanOrEqual(0)
    const urlLine = app.lines[urlLineIdx]!
    // Either the colon is on the same line directly after the URL, or the URL
    // ends mid-line and the colon is inline next-token-wise. We require the
    // colon to be on the URL's line OR within the same logical paragraph
    // (i.e. the next non-blank line, NOT alone).
    const colonOnSameLine = urlLine.includes("github.com/beorn/bearly:")
    expect(colonOnSameLine, `colon should flow with URL on same line, got:\n  "${urlLine}"\nframe:\n${app.text}`).toBe(
      true,
    )
  })

  test("C: bold and italic spans are rendered with bold/italic cell attributes", () => {
    // Use distinct, single-word spans so we can locate the cell precisely.
    const source = "Plain prose with **boldword** and *italicword* embedded inline."
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Frame source={source} />)

    // Locate "boldword" — find the row + start col.
    const boldRow = app.lines.findIndex((line) => line.includes("boldword"))
    expect(boldRow, `"boldword" missing from frame:\n${app.text}`).toBeGreaterThanOrEqual(0)
    const boldCol = app.lines[boldRow]!.indexOf("boldword")
    // Cell at the first character of "boldword" should carry the bold attr.
    const boldCell = app.cell(boldCol, boldRow)
    expect(
      boldCell.bold,
      `expected bold attr at (${boldCol},${boldRow}) for "boldword"; cell=${JSON.stringify(boldCell)}`,
    ).toBe(true)

    // Italic.
    const italicRow = app.lines.findIndex((line) => line.includes("italicword"))
    expect(italicRow, `"italicword" missing`).toBeGreaterThanOrEqual(0)
    const italicCol = app.lines[italicRow]!.indexOf("italicword")
    const italicCell = app.cell(italicCol, italicRow)
    expect(
      italicCell.italic,
      `expected italic attr at (${italicCol},${italicRow}) for "italicword"; cell=${JSON.stringify(italicCell)}`,
    ).toBe(true)
  })
})

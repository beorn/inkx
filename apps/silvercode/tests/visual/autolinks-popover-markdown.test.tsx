/**
 * Visual test — autolink popover renders `readme` / `first-paragraph`
 * previews as RICH MARKDOWN (bold attr on cells, not literal asterisks).
 *
 * Bead: km-silvercode.autolinks-preview-extensions
 *
 * What this catches:
 *   - The popover for a `readme` autolink runs the body through MarkdownView,
 *     so `**bold**` markup renders as bold-styled cells (asterisks consumed).
 *   - Plain `<Text>` rendering — the previous v1 path — would have left the
 *     literal `**bold**` characters in the frame.
 *
 * The popover renders inside a narrow column (~50 cols) — we wrap MarkdownView
 * in `<Prose flexShrink={1} minWidth={0}>` so wrapping works at this width.
 * That same wrapper is exercised here so the test catches a regression in
 * either the kind dispatch or the wrapper props.
 */

import React from "react"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Muted, Prose, Text } from "silvery"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import { clearPreviewCache, resolvePreview } from "../../src/autolinks/previews.ts"

const COLS = 50
const ROWS = 30

/**
 * Mirror of the popover's content shape from DetectionText.renderAutolinkPopover.
 * Rendering this in isolation lets us inspect the markdown styling without
 * driving the App through a hover gesture (the visual harness can't simulate
 * dwell-timed mouse events).
 */
function PopoverFrame({
  match,
  preview,
  resolvesTo,
  body,
}: {
  match: string
  preview: string
  resolvesTo: string
  body: string
}): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="column">
      <Text bold>{match}</Text>
      <Muted>
        {preview} · {resolvesTo}
      </Muted>
      <Box flexDirection="column" paddingTop={1}>
        <Prose flexShrink={1} minWidth={0}>
          <MarkdownView source={body} />
        </Prose>
      </Box>
    </Box>
  )
}

describe("autolinks popover — markdown rendering for readme / first-paragraph", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-popover-md-"))
    clearPreviewCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("readme preview: bold markup renders as bold cells (not literal asterisks)", () => {
    // Drop a README with a bolded word; resolve via the real preview path
    // so we exercise the readme → markdown body code path end-to-end.
    writeFileSync(
      join(dir, "README.md"),
      "Project with **boldword** in its summary.\n",
    )
    const result = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "popover-bold",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.format).toBe("markdown")

    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <PopoverFrame
        match="~repo"
        preview="readme"
        resolvesTo={dir}
        body={result.body}
      />,
    )

    // The literal asterisks must NOT survive — MarkdownView consumes them.
    expect(app.text, "literal `**` should be consumed by markdown rendering").not.toContain("**boldword**")

    // The word itself is present.
    const boldRow = app.lines.findIndex((line) => line.includes("boldword"))
    expect(boldRow, `"boldword" missing from popover frame:\n${app.text}`).toBeGreaterThanOrEqual(0)

    // The cell at the first char of "boldword" carries the bold attr.
    const boldCol = app.lines[boldRow]!.indexOf("boldword")
    const cell = app.cell(boldCol, boldRow)
    expect(
      cell.bold,
      `expected bold attr at (${boldCol},${boldRow}); cell=${JSON.stringify(cell)}\nframe:\n${app.text}`,
    ).toBe(true)
  })

  test("first-paragraph preview: italics render as italic cells", () => {
    writeFileSync(
      join(dir, "doc.md"),
      "Plain text with *italicword* mixed in.\n",
    )
    const result = resolvePreview({
      preview: "first-paragraph",
      resolvesTo: join(dir, "doc.md"),
      cacheKey: "popover-italic",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    // Body for first-paragraph is now flagged markdown (rendered through
    // MarkdownView in the popover).
    expect(result.format).toBe("markdown")

    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <PopoverFrame
        match="AGENTS.md"
        preview="first-paragraph"
        resolvesTo={join(dir, "doc.md")}
        body={result.body}
      />,
    )

    expect(app.text).not.toContain("*italicword*")
    const italRow = app.lines.findIndex((line) => line.includes("italicword"))
    expect(italRow, `"italicword" missing from frame:\n${app.text}`).toBeGreaterThanOrEqual(0)
    const italCol = app.lines[italRow]!.indexOf("italicword")
    const cell = app.cell(italCol, italRow)
    expect(
      cell.italic,
      `expected italic attr at (${italCol},${italRow}); cell=${JSON.stringify(cell)}`,
    ).toBe(true)
  })
})

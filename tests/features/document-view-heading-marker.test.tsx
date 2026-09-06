/**
 * DocumentHeadingBlock.marker — the heading task-checkbox gutter.
 *
 * Regression coverage for @si/app/22571-maddoc-doc-viewer-umbrella/22938,
 * across three revisions:
 *
 * Rev 1 (landed, then reverted in spirit): the shipped fix made room for a
 * marker by INDENTING every heading title — text shifted right by
 * markerWidth+1 the instant ANY heading in the document carried a marker.
 * Operator: "headings keep their column; the marker outdents into the left
 * margin" — backwards from what shipped.
 *
 * Rev 2: a zero-outer-width negative-margin technique fixed the hang
 * direction, but reached back into `ProseLane`'s own natural side gutter
 * (a 1-cell floor) using ONLY `markerWidth`, no gap cell — a wider
 * `markerWidth + 1` gutter had been tried first and measurably clipped the
 * glyph invisible the moment that floor was the binding constraint.
 * Operator feedback on the glued-glyph result: "there needs to be a space
 * between the marker and the title... now the marker is flush." A
 * follow-up cut reserved the gap as a real, per-heading `Content.Body
 * paddingLeft` instead — safe and gapped, but it insets only headings, so
 * a heading and an ordinary paragraph in the same marker-bearing document
 * no longer shared a left margin.
 *
 * Rev 3 (this file, current): operator ruling — no degrade at all.
 * `ProseLane`'s gutter floor (`Content.tsx`, `ContentLayoutContextValue.
 * gutterMinWidth`) is now CONFIGURABLE, and `DocumentView` raises it to
 * `DOCUMENT_MIN_GUTTER` (2) for every document it renders, unconditionally
 * — not just marker-bearing ones, both sides, regardless of pane width.
 * `HeadingRow` still reaches back `markerWidth + 1` cells with the same
 * zero-outer-width negative margin, but now into a gutter that is ALWAYS
 * wide enough, so the gap can never be pinched away, and — as a direct
 * consequence of raising a shared floor rather than reserving a per-block
 * inset — a marked heading's title lands on the exact same column as it
 * would in a document that never uses heading markers at all.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Content,
  DocumentView,
  Text,
  ThemeProvider,
  type DocumentBlock,
  type DocumentHeadingBlock,
} from "@silvery/ag-react"

function titleColumn(app: ReturnType<ReturnType<typeof createRenderer>>, title: string): number {
  const row = app.lines.findIndex((line) => line.includes(title))
  expect(row, `row containing "${title}"`).toBeGreaterThanOrEqual(0)
  return app.lines[row]!.indexOf(title)
}

describe("DocumentView heading marker gutter", () => {
  test("the marker hangs to the LEFT of the title column, with a visible gap between them", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "h",
        kind: "heading",
        level: 3,
        content: "PHASE 3a — Git and Yrd",
        marker: <Text color="$fg-warning">◐</Text>,
      } satisfies DocumentHeadingBlock,
    ]
    const app = createRenderer({ cols: 72, rows: 8 })(<DocumentView blocks={blocks} />)
    const row = app.lines.findIndex((line) => line.includes("PHASE 3a"))
    expect(row).toBeGreaterThanOrEqual(0)
    const line = app.lines[row]!
    const markerColumn = line.indexOf("◐")
    const titleColumnIndex = line.indexOf("PHASE 3a")
    expect(markerColumn).toBeGreaterThanOrEqual(0)
    // Hanging indent: the glyph sits in the margin, strictly left of the
    // title's own column.
    expect(markerColumn).toBeLessThan(titleColumnIndex)
    // The operator-required gap: at least one blank cell between the glyph
    // and the title — "◐PHASE 3a" (glued, rev 2's first cut) fails this.
    expect(titleColumnIndex - markerColumn).toBeGreaterThanOrEqual(2)
    expect(line.slice(markerColumn + 1, titleColumnIndex)).toBe(
      " ".repeat(titleColumnIndex - markerColumn - 1),
    )
  })

  test.each([
    [1, "$primary"],
    [2, "mix($primary, $fg, 50%)"],
    [3, "$fg"],
    [4, "$muted"],
    [5, "$muted"],
    [6, "$muted"],
  ] as const)(
    "level %i keeps task/title alignment and gives only non-task headings a subdued #",
    (level, foreground) => {
      const blocks: DocumentBlock[] = [
        {
          id: "task",
          kind: "heading",
          level,
          content: "PHASE 3a — Git and Yrd",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
        { id: "plain", kind: "heading", level, content: "PHASE 3b — Agent management" },
      ]
      const tokens = { fg: "#eeeeee", bg: "#202020" }
      const app = createRenderer({ cols: 72, rows: 10 })(
        <ThemeProvider tokens={tokens}>
          <DocumentView blocks={blocks} />
        </ThemeProvider>,
      )
      expect(titleColumn(app, "PHASE 3a")).toBe(titleColumn(app, "PHASE 3b"))
      const taskRow = app.lines.findIndex((line) => line.includes("PHASE 3a"))
      const plainRow = app.lines.findIndex((line) => line.includes("PHASE 3b"))
      const markerColumn = titleColumn(app, "PHASE 3b") - 2
      expect(app.lines[taskRow]).toContain("◐ PHASE 3a")
      expect(app.lines[taskRow]).not.toContain("#")
      expect(app.lines[plainRow]).toContain("# PHASE 3b")
      const expected = createRenderer({ cols: 1, rows: 1 })(
        <ThemeProvider tokens={tokens}>
          <Text color={`mix(${foreground}, $bg, 75%)`}>#</Text>
        </ThemeProvider>,
      )
      expect(app.cell(markerColumn, plainRow).fg).toEqual(expected.cell(0, 0).fg)
    },
  )

  test("a document with no heading markers renders byte-identical to the same document without the marker field", () => {
    const withoutField: DocumentBlock[] = [
      { id: "h", kind: "heading", level: 2, content: "Untasked section" },
      { id: "body", kind: "paragraph", content: "Body." },
    ]
    const withUndefinedMarker: DocumentBlock[] = [
      { id: "h", kind: "heading", level: 2, content: "Untasked section", marker: undefined },
      { id: "body", kind: "paragraph", content: "Body." },
    ]
    const cols = 60
    const rows = 8
    const a = createRenderer({ cols, rows })(<DocumentView blocks={withoutField} />)
    const b = createRenderer({ cols, rows })(<DocumentView blocks={withUndefinedMarker} />)
    expect(b.text).toBe(a.text)
  })

  test("a marked heading's title lands on the SAME column as the identical heading in a fully marker-less document", () => {
    // The invariant rev 2's per-heading paddingLeft trade explicitly gave
    // up (documented there as operator-approved at the time). Raising the
    // shared gutter floor instead — this revision — restores it for free:
    // nothing about the marked document's OWN geometry differs from the
    // marker-less one's, at any width, because both now use the identical
    // DOCUMENT_MIN_GUTTER floor regardless of whether a marker is present
    // anywhere in the document.
    for (const cols of [40, 60, 82, 120, 200]) {
      const unmarked: DocumentBlock[] = [
        { id: "h", kind: "heading", level: 2, content: "Section Title" },
      ]
      const marked: DocumentBlock[] = [
        {
          id: "h",
          kind: "heading",
          level: 2,
          content: "Section Title",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
      ]
      const unmarkedApp = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={unmarked} />
        </Content.Layout>,
      )
      const markedApp = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={marked} />
        </Content.Layout>,
      )
      expect(titleColumn(markedApp, "Section Title"), `cols=${cols}`).toBe(
        titleColumn(unmarkedApp, "Section Title"),
      )
    }
  })

  test("title column is width-independent WITHIN a marker-bearing document — task heading matches non-task heading and its own paragraph, at any width", () => {
    // km-tui's DetailView wraps KNodeDocumentView in <Content.Layout prose={80}
    // wide={120}>. Both within-document invariants must hold from a narrow
    // split pane up through a wide terminal, never just in the generous case.
    for (const cols of [40, 60, 82, 120, 200]) {
      const blocks: DocumentBlock[] = [
        {
          id: "task",
          kind: "heading",
          level: 3,
          content: "Task Section",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
        { id: "plain", kind: "heading", level: 3, content: "Plain Section" },
        { id: "body", kind: "paragraph", content: "Plain body text." },
      ]
      const app = createRenderer({ cols, rows: 10 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      expect(titleColumn(app, "Task Section"), `cols=${cols}`).toBe(
        titleColumn(app, "Plain Section"),
      )
      expect(titleColumn(app, "Task Section"), `cols=${cols}`).toBe(
        titleColumn(app, "Plain body text."),
      )
    }
  })

  test("the marker is visible WITH its gap at every width from a narrow split pane up through a wide terminal — no flush case", () => {
    // The bug this pins: a markerWidth+1 gutter reaching into ProseLane's
    // OLD (1-cell-floor) side gutter rendered ZERO visible glyph at cols
    // 40/60/70/82 under km-tui's prose={80} — the natural gutter pinched to
    // exactly 1 cell, one short of the 2 a "glyph + gap" gutter needs. This
    // revision raises the floor itself, so there is no pinch band left to
    // fall back from — the glyph AND its trailing gap must both be visible
    // at every width, with no narrower "marker glued to the title" case.
    for (const cols of [30, 40, 60, 70, 82, 90, 120, 200]) {
      const marked: DocumentBlock[] = [
        {
          id: "h",
          kind: "heading",
          level: 3,
          content: "Section Title",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
      ]
      const app = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={marked} />
        </Content.Layout>,
      )
      expect(app.text, `cols=${cols}`).toContain("◐")
      const row = app.lines.findIndex((line) => line.includes("Section Title"))
      expect(row, `cols=${cols}`).toBeGreaterThanOrEqual(0)
      const line = app.lines[row]!
      const markerColumn = line.indexOf("◐")
      const titleColumnIndex = line.indexOf("Section Title")
      expect(titleColumnIndex - markerColumn, `cols=${cols}`).toBeGreaterThanOrEqual(2)
    }
  })

  test("every document reserves a 2-cell LEFT margin for the heading # and its gap, at any pane width", () => {
    // Operator: "we always make sure there's a 2-space column to the left
    // and right of text" — unconditional, not gated on whether this
    // particular document happens to use heading markers. A plain,
    // marker-free document must show the same 2-cell floor as a
    // marker-bearing one.
    for (const cols of [30, 40, 60, 70, 82, 90, 120, 200]) {
      const blocks: DocumentBlock[] = [
        { id: "h", kind: "heading", level: 2, content: "Plain Heading" },
      ]
      const app = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      const row = app.lines.findIndex((line) => line.includes("Plain Heading"))
      expect(row, `cols=${cols}`).toBeGreaterThanOrEqual(0)
      expect(titleColumn(app, "Plain Heading"), `cols=${cols}`).toBeGreaterThanOrEqual(2)
      const titleStart = titleColumn(app, "Plain Heading")
      expect(app.cell(titleStart - 2, row).char, `cols=${cols} outdented marker`).toBe("#")
      expect(app.cell(titleStart - 1, row).char, `cols=${cols} marker gap`).toBe(" ")
    }
  })

  test("a paragraph keeps a blank 2-cell margin on the RIGHT of its text at a pinch-band width, marker or no marker", () => {
    // Right-side counterpart to the left-margin test above, at the exact
    // width band (prose={80}, panes at/under ~82 cols) where the OLD
    // 1-cell floor used to pinch the marker gutter — tight-packed
    // single-character tokens fill lines to within 1 cell of ProseLane's
    // true content edge, so the fullest wrapped line's own trailing gap
    // measures the real right gutter, not word-wrap slack.
    for (const cols of [40, 60, 82]) {
      const content = Array.from({ length: 200 }, () => "y").join(" ")
      const blocks: DocumentBlock[] = [{ id: "p", kind: "paragraph", content }]
      const app = createRenderer({ cols, rows: 20 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      let fullestLine = ""
      for (const line of app.lines) {
        if (line.includes("y") && line.trimEnd().length > fullestLine.trimEnd().length) {
          fullestLine = line
        }
      }
      expect(fullestLine, `cols=${cols}`).not.toBe("")
      const rightGutter = cols - fullestLine.trimEnd().length
      // >= 2 with headroom for word-wrap slack (a token may not fit even
      // when 2+ blank cells remain) — the guarantee is a FLOOR, not an
      // exact width, so this only needs to rule out the old 0-1 cell pinch.
      expect(rightGutter, `cols=${cols}`).toBeGreaterThanOrEqual(2)
    }
  })
})

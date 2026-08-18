/**
 * DocumentHeadingBlock.marker — the heading task-checkbox gutter.
 *
 * Regression coverage for @si/app/22571-maddoc-doc-viewer-umbrella/22938,
 * across two revisions:
 *
 * Rev 1 (landed, then reverted in spirit): the shipped fix made room for a
 * marker by INDENTING every heading title — text shifted right by
 * markerWidth+1 the instant ANY heading in the document carried a marker.
 * Operator: "headings keep their column; the marker outdents into the left
 * margin" — backwards from what shipped.
 *
 * Rev 2 (this file, current): a zero-outer-width negative-margin technique
 * fixed the hang direction, but its first cut reached back into
 * `ProseLane`'s own natural side gutter — which floors at 1 cell — using
 * ONLY `markerWidth` (no gap cell), because a `markerWidth + 1` gutter
 * measurably clipped the glyph invisible the moment that floor was the
 * binding constraint. Operator feedback on THAT result: "there needs to be
 * a space between the marker and the title... now the marker is flush."
 *
 * Current design: `HeadingRow` still uses the zero-outer-width negative
 * margin (so a task heading's title and a non-task heading's title in the
 * SAME document land on the identical column, at any pane width), but the
 * gutter it reaches into is now REAL, guaranteed `Content.Body paddingLeft`
 * — reserved once, up front, by `BlockFrame`'s `contentPaddingLeft` — not
 * borrowed from `ProseLane`'s uncertain natural floor. That guarantees
 * room for `markerWidth + 1` cells (glyph + one visible gap cell) at any
 * pane width, at the cost of insetting every heading in a marker-bearing
 * document by that same amount relative to a fully marker-less document
 * (or to that document's own paragraphs) — an explicit, operator-approved
 * trade against the alternative of an invisible or gapless glyph.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Content,
  DocumentView,
  Text,
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

  test("a task heading and a non-task heading in the SAME document still align on the title column", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "task",
        kind: "heading",
        level: 3,
        content: "PHASE 3a — Git and Yrd",
        marker: <Text color="$fg-warning">◐</Text>,
      } satisfies DocumentHeadingBlock,
      { id: "plain", kind: "heading", level: 3, content: "PHASE 3b — Agent management" },
    ]
    const app = createRenderer({ cols: 72, rows: 10 })(<DocumentView blocks={blocks} />)
    expect(titleColumn(app, "PHASE 3a")).toBe(titleColumn(app, "PHASE 3b"))
    // The non-task heading's reserved slot renders blank, not a stray glyph.
    expect(app.text).not.toContain("◐ PHASE 3b")
    expect(app.text).not.toContain("◐PHASE 3b")
  })

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

  test("a marker-bearing document insets EVERY heading by markerWidth + 1, deliberately — not just the marked one", () => {
    // The explicit, operator-approved trade: reserving a real, guaranteed
    // gutter (so the gap can never be clipped) costs a fixed inset on every
    // heading in a document that uses heading markers at all, relative to a
    // document that never does. This is intentional design, not a leftover
    // bug — pin the exact amount so a future change doesn't silently drift
    // it in either direction.
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
    const cols = 60
    const rows = 8
    const unmarkedApp = createRenderer({ cols, rows })(<DocumentView blocks={unmarked} />)
    const markedApp = createRenderer({ cols, rows })(<DocumentView blocks={marked} />)
    const markerWidth = 1 // "◐" is one cell
    expect(titleColumn(markedApp, "Section Title")).toBe(
      titleColumn(unmarkedApp, "Section Title") + markerWidth + 1,
    )
  })

  test("title column is width-independent WITHIN a marker-bearing document — task heading matches non-task heading at any width", () => {
    // km-tui's DetailView wraps KNodeDocumentView in <Content.Layout prose={80}
    // wide={120}>. The invariant that must hold at any pane width is
    // within-document alignment: a task heading and a non-task heading in
    // the SAME document land on the same title column, from a narrow split
    // pane up through a wide terminal — never just in the generous case.
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
      ]
      const app = createRenderer({ cols, rows: 8 })(
        <Content.Layout fill={false} prose={80} wide={120}>
          <DocumentView blocks={blocks} />
        </Content.Layout>,
      )
      expect(titleColumn(app, "Task Section"), `cols=${cols}`).toBe(
        titleColumn(app, "Plain Section"),
      )
    }
  })

  test("the marker is visible WITH its gap at every width from a narrow split pane up through a wide terminal", () => {
    // The bug this pins: a markerWidth+1 gutter reaching into ProseLane's
    // own (1-cell-floor) side gutter rendered ZERO visible glyph at cols
    // 40/60/70/82 under km-tui's prose={80} — the natural gutter pinched to
    // exactly 1 cell, one short of the 2 a "glyph + gap" gutter needs, and
    // the excess painted at a negative, off-screen column. Reserving the
    // gutter as real Content.Body padding (this revision) must never
    // reproduce that: the glyph AND its trailing gap must both be visible,
    // at every width a real pane is likely to be.
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
})

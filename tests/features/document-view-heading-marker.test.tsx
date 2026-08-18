/**
 * DocumentHeadingBlock.marker — the heading task-checkbox gutter.
 *
 * Regression coverage for @si/app/22571-maddoc-doc-viewer-umbrella/22938:
 * the landed fix first shipped by INDENTING every heading title to make
 * room for the marker column. That is backwards — headings must keep their
 * column, and the marker hangs OUTDENTED into the left margin. `HeadingRow`
 * (DocumentView.tsx) achieves this with a zero-outer-width flex sibling —
 * width `markerWidth`, `marginLeft` the exact negative of that width — so
 * the marker's presence contributes nothing to the row's layout math and
 * the title's column is provably identical with or without it, at ANY pane
 * width (unlike `Content.Row`'s `Content.Left` side slot, which claims real
 * width from the row and drifts once the pane is narrower than the
 * document's configured prose target — see the width-sweep tests below).
 *
 * The gutter is exactly `markerWidth`, with NO separate gap cell: a wider
 * gutter (`markerWidth + 1`) measurably clipped the glyph off-screen the
 * moment `ProseLane`'s natural side gutter pinched to its 1-cell floor
 * (any pane at or below the document's configured prose width — including
 * km-tui's own `prose={80}` below ~82 columns). An invisible checkbox fails
 * the feature outright, so "glued to the text, always visible" beats "one
 * gap cell, invisible under realistic panes."
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Content, DocumentView, Text, type DocumentBlock, type DocumentHeadingBlock } from "@silvery/ag-react"

function titleColumn(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  title: string,
): number {
  const row = app.lines.findIndex((line) => line.includes(title))
  expect(row, `row containing "${title}"`).toBeGreaterThanOrEqual(0)
  return app.lines[row]!.indexOf(title)
}

describe("DocumentView heading marker gutter", () => {
  test("a task heading's title starts at the SAME column as a heading with no marker feature in use at all", () => {
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

    // The regression: a landed rev shifted this column right by
    // markerWidth+1 the moment ANY heading in the document carried a
    // marker. The title must land in the exact same place either way.
    expect(titleColumn(markedApp, "Section Title")).toBe(titleColumn(unmarkedApp, "Section Title"))
  })

  test("the marker hangs to the LEFT of the title column, in the margin", () => {
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
    const markerColumn = app.lines[row]!.indexOf("◐")
    const titleColumnIndex = app.lines[row]!.indexOf("PHASE 3a")
    expect(markerColumn).toBeGreaterThanOrEqual(0)
    // Hanging indent: the glyph sits in the margin, strictly left of the
    // title's own column — not inline-prefixed onto the title (that would
    // put the marker immediately adjacent, still shifting nothing else, but
    // this pins the outdent direction unambiguously against "glued to the
    // text" alternatives).
    expect(markerColumn).toBeLessThan(titleColumnIndex)
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

  test("heading title column matches an ordinary paragraph's column in the same document", () => {
    const blocks: DocumentBlock[] = [
      {
        id: "task",
        kind: "heading",
        level: 2,
        content: "Tasked Heading",
        marker: <Text color="$fg-warning">◐</Text>,
      } satisfies DocumentHeadingBlock,
      { id: "body", kind: "paragraph", content: "Plain body text." },
    ]
    const app = createRenderer({ cols: 60, rows: 8 })(<DocumentView blocks={blocks} />)
    expect(titleColumn(app, "Tasked Heading")).toBe(titleColumn(app, "Plain body text."))
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

  test("title column is width-independent, including panes narrower than the configured prose target", () => {
    // km-tui's DetailView wraps KNodeDocumentView in <Content.Layout prose={80}
    // wide={120}>. A `Content.Row` side slot (Content.Left) claims width from
    // the row BEFORE the prose lane is sized, so once the pane drops below
    // ~prose+2 the lane itself narrows and a marker'd heading's title drifts
    // from a marker-less heading's title — invisible at generous widths,
    // real at realistic split-pane widths. HeadingRow's zero-outer-width
    // technique has no such threshold: assert equality across a sweep that
    // spans comfortably-wide down through exactly this pinch point.
    for (const cols of [40, 60, 82, 120, 200]) {
      const unmarked: DocumentBlock[] = [
        { id: "h", kind: "heading", level: 3, content: "Section Title" },
        { id: "body", kind: "paragraph", content: "Body text." },
      ]
      const marked: DocumentBlock[] = [
        {
          id: "h",
          kind: "heading",
          level: 3,
          content: "Section Title",
          marker: <Text color="$fg-warning">◐</Text>,
        } satisfies DocumentHeadingBlock,
        { id: "body", kind: "paragraph", content: "Body text." },
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
      // The heading and its own document's paragraph must also stay aligned
      // at every width — both invariants break under the side-slot approach
      // once the pane pinches below the prose target.
      expect(titleColumn(markedApp, "Section Title"), `cols=${cols}`).toBe(
        titleColumn(markedApp, "Body text."),
      )
    }
  })

  test("the marker is never clipped invisible, at any width from a narrow split pane up through a wide terminal", () => {
    // The bug this pins: a `markerWidth + 1` gutter (marker + gap cell)
    // rendered ZERO visible glyph at cols 40/60/70/82 under km-tui's
    // `prose={80}` — `ProseLane`'s natural left gutter pinches to exactly 1
    // cell in that regime, one cell short of what a 2-cell gutter needs, and
    // the excess simply painted at a negative, off-screen column. A visible
    // checkbox is the entire point of the feature — this must never regress.
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
    }
  })
})

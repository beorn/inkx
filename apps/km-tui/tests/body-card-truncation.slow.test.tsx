/**
 * Body-card truncation tests (bead: km-tui.column-top-disappears)
 *
 * Body cards render content (paragraphs, code blocks, quotes, HRs) that appears
 * BEFORE the first structural outline item in a column. Unlike structural cards
 * — which cap visible children at `treeConfig.maxContentLines` and show a
 * `+N more` indicator — body cards previously rendered their entire payload.
 *
 * Observed real-vault bug: a body card whose `content` was a single large text
 * block (~50 lines of aggregated markdown/JSON/gitconfig) expanded to 80+ rows,
 * pushing everything below out of the viewport so the column appeared to have
 * no other content.
 *
 * Root cause (`apps/km-tui/src/views/CardColumn.tsx:358-396`): the body-card
 * branch passed the TreeNode straight through with `remainingDepth=2` and
 * `wrap="wrap"`, with no row budget to clamp the visual footprint.
 *
 * Fix: cap rendered rows at `treeConfig.maxBodyContentRows` (default 6). When
 * the content would exceed the budget, slice to fit and show a `···` overflow
 * indicator row — same visual language as the structural-card `+N more`
 * affordance.
 *
 * Policy (documented in CardColumn):
 * - Editing this card → bypass the clamp (full content visible while editing).
 * - Cursor on a descendant of this card → bypass (expand for navigation).
 * - Wrapped long lines count toward the budget the same as explicit newlines.
 * - Exactly at budget → no indicator.
 * - One line over → indicator shown.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// Compose a giant body-card content: a single ~50-line code block.
// This mirrors the real-vault shape (one big text/code block, no nested
// structure) — reducing remainingDepth would NOT fix this case because the
// depth is already 0.
function giantCodeContent(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `line-${i + 1}: some example content here`).join("\n")
}

describe("body-card row-budget truncation", () => {
  test("giant single-text body card clamps to budget with ··· indicator", () => {
    // A column with a large body code block BEFORE a structural card.
    // The code block becomes a body card (content before the first outline item).
    // The fixture gives the column enough vertical space (40 rows) that any
    // truncation is a presentation decision — not a viewport-clipping artifact.
    const bigText = giantCodeContent(50)
    // item()'s leaf factory uses the node's content string as its ID, so we
    // can query the rendered body card by passing the full content. The
    // constant below lets the test stay readable.
    const codeNodeId = bigText
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code(bigText), // body card: one giant text block
          item.file("structuralCard", item("sc-child")), // structural card below it
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )

    // Move the cursor to the structural card so the breadcrumb shows
    // "col > structuralCard" rather than the full body-card content. The
    // header path renders `node.content` verbatim — an unrelated concern
    // that only obscures this test when the cursor sits on the giant body
    // card. The body-card clamp under test is cursor-independent.
    app.press("j")
    expect(app).toHaveCursorOn("structuralCard")

    const text = app.text
    expect(text, "body-card should render at least the first line of content").toContain("line-1")

    // Primary invariant: the rendered body-card box is clamped to at most
    // `maxBodyContentRows + 1` rows (content budget + 1 for the `···`
    // indicator). Before the fix this card rendered all 50 lines, blowing
    // through the viewport.
    const codeBox = app.screen.nodeBox(codeNodeId)
    expect(codeBox, "body card should have a registered bounding box").not.toBeNull()
    if (codeBox) {
      expect(
        codeBox.height,
        `body card height=${codeBox.height} — expected ≤ 8 rows (budget=6 plus indicator plus tolerance)`,
      ).toBeLessThanOrEqual(8)
    }

    // The structural card must be visible below the body card within the
    // viewport — not pushed 50 rows down. This is what originally made the
    // column appear to have "disappeared" at the top.
    const structBox = app.screen.nodeBox("structuralCard")
    expect(structBox, "structural card must be visible in the viewport").not.toBeNull()

    // Overflow affordance: the `···` indicator signals "there is more
    // below." Same visual language as the structural-card `+N more` border.
    expect(text, "clamped body card must show a ··· overflow indicator").toContain("···")
    // And the count matches `content rows - budget`.
    expect(text, "indicator shows hidden-row count").toMatch(/\+\d+ more/)
  })

  test("short body card (under budget) renders in full with no ··· indicator", () => {
    // Short body content (2 lines) — well under the 6-row budget — should
    // render untouched, no overflow indicator.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("short line one\nshort line two"),
          item.file("structuralCard", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )

    const text = app.text
    expect(text).toContain("short line one")
    expect(text).toContain("short line two")
    // No truncation indicator for content that fits within the budget.
    expect(text).not.toContain("···")
  })

  test("exact-budget body card (rows === maxBodyContentRows) renders without ··· indicator", () => {
    // Content exactly at the 6-row budget should render in full with NO
    // overflow indicator. This exercises the `rows === maxRows` edge case
    // in TreeNode's maxRows clamp — exact fit is a no-op.
    const exact = giantCodeContent(6) // exactly 6 lines = budget
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code(exact),
          item.file("structuralCard", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )

    // Move cursor off the body card so breadcrumbs don't pollute the screen
    app.press("j")

    const text = app.text
    // All 6 lines present
    for (let i = 1; i <= 6; i++) {
      expect(text, `line-${i} should be visible at exact budget`).toContain(`line-${i}`)
    }
    // No overflow indicator when content fits exactly
    expect(text, "exact-budget content must not show ··· indicator").not.toContain("···")
  })

  test("one-row-over budget triggers ··· indicator", () => {
    // Content that is ONE row over the 6-row budget should trigger the
    // clamp: 5 rows of content shown, plus the overflow indicator on row 6.
    const justOver = giantCodeContent(7) // 7 lines, budget is 6
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code(justOver),
          item.file("structuralCard", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j") // move cursor off body card

    const text = app.text
    // First line of content is visible; last line is not
    expect(text).toContain("line-1")
    expect(text, "line-7 should be clamped out at one-over-budget").not.toContain("line-7")
    // Indicator is shown with the hidden-row count
    expect(text, "clamp boundary must show ··· indicator").toContain("···")
    expect(text, "indicator includes hidden-row count").toMatch(/\+\d+ more/)
  })
})

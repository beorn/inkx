/**
 * Body-block spacing tests (bead: km-tui.body-block-leading-gap)
 *
 * Unframed body blocks (paragraphs, code blocks, quotes) rendered in a
 * kanban column currently carry an unconditional `paddingTop={1}` inside
 * each block's outer `<Box>`. That gives every body block a single leading
 * blank row. Between a structural card (bordered) and a following body
 * block that reads fine — the structural card's border plus the blank row
 * visually separates them.
 *
 * Between TWO CONSECUTIVE BODY BLOCKS the blank row is phantom whitespace:
 * both blocks are borderless prose, and the leading blank row on the
 * *second* block appears as a gap between otherwise-adjacent paragraphs
 * that the user reported seeing in the real vault ("Agent Next Actions
 * @agent" column).
 *
 * Invariant under test: between two consecutive short body blocks, there
 * are ZERO blank rows. Body blocks run flush against each other like
 * stacked prose. Structural-card neighbours retain their existing 0-row
 * abutment (no regression there).
 *
 * See `apps/km-tui/src/views/CardColumn.tsx` body-block branch for the
 * `paddingTop` contract this test constrains. The fix makes that padding
 * conditional (only when the previous sibling is NOT a body block).
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

/**
 * Measure the number of fully-blank rows between two rendered node bounding
 * boxes. Uses the rendered text (not just the bounding-box math) so the test
 * reflects what the user actually sees, including any padding row the Card
 * wrapper applies INSIDE its box.
 */
function blankRowsBetween(app: ReturnType<typeof createTestApp>, prevY: number, prevH: number, nextY: number): number {
  // Rows strictly between the last content row of `prev` and the first content
  // row of `next` (exclusive on both ends). `prev.y + prev.h` is the row AFTER
  // prev's last content row.
  let blanks = 0
  for (let y = prevY + prevH; y < nextY; y++) {
    const row = app.screen.row(y)
    if (row.trim() === "") blanks++
  }
  return blanks
}

describe("body-block spacing", () => {
  test("consecutive short body blocks leave at most 1 blank row between them", () => {
    // Three short body blocks + a structural card. item.code(content) produces
    // a code-type node which km-tui's viewtree classifies as a body card when
    // it appears before the first structural item in its parent column.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("alpha-body-line"),
          item.code("beta-body-line"),
          item.code("gamma-body-line"),
          item.file("structural-card", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )

    // Move cursor off the first body card so breadcrumbs / cursor highlight
    // don't perturb the measured gap.
    app.press("j")

    const ids = ["alpha-body-line", "beta-body-line", "gamma-body-line"] as const
    const boxes = ids.map((id) => {
      const box = app.screen.nodeBox(id)
      expect(box, `body card "${id}" should have a registered bounding box`).not.toBeNull()
      return box!
    })

    for (const [idx, nextBox] of boxes.slice(1).entries()) {
      const prevBox = boxes[idx]!
      const blanks = blankRowsBetween(app, prevBox.y, prevBox.height, nextBox.y)
      // Consecutive body blocks should abut — no blank row between them.
      // A leading blank row on the second block is phantom whitespace.
      expect(
        blanks,
        `blank rows between body blocks "${ids[idx]}" and "${ids[idx + 1]}": ` +
          `prev.y=${prevBox.y} prev.h=${prevBox.height} next.y=${nextBox.y} — got ${blanks}, expected 0`,
      ).toBe(0)
    }
  })

  test("body block → structural card leaves at most 1 blank row between them", () => {
    // This mirrors the real-vault case: a run of body-block content followed
    // by a structural (bordered) card. The user reported 3-4 phantom blank
    // rows in this transition in the "Agent Next Actions @agent" column.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("alpha-body-line"),
          item.code("beta-body-line"),
          item.file("structural-card", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j") // move cursor off the first body block

    const bodyBox = app.screen.nodeBox("beta-body-line")
    const structBox = app.screen.nodeBox("structural-card")
    expect(bodyBox, "last body block must be registered").not.toBeNull()
    expect(structBox, "structural card must be registered").not.toBeNull()
    const prev = bodyBox!
    const next = structBox!

    // The structural card's `nodeBox` reports the inner content box (id = card
    // nodeId on the Box INSIDE the border). The border's top line sits at
    // `next.y - 1`, so we want the blank rows between prev's last content row
    // and `next.y - 1` (the border row itself isn't a blank row).
    const blanks = blankRowsBetween(app, prev.y, prev.height, next.y - 1)
    expect(
      blanks,
      `blank rows between last body block and structural card top border: ` +
        `prev.y=${prev.y} prev.h=${prev.height} next.y=${next.y} (border at ${next.y - 1}) — ` +
        `got ${blanks} blank rows, expected ≤ 1`,
    ).toBeLessThanOrEqual(1)
  })

  test("body block with overflow indicator + structural card: no phantom gap rows", () => {
    // Reproduces the real-vault @agent.md shape: the @agent column contains
    // multiple paragraph bodies ("How to use...", "Grooming rule..."), some
    // of which are long enough to trigger the `··· +N more` row-budget clamp.
    // Immediately after, a structural card (e.g. "### 🐛 km bugs") starts.
    // In the wild, 3-4 blank rows appear between the ··· indicator and the
    // structural card's top border. This is the phantom gap under test.
    const longParagraphLike = Array.from({ length: 20 }, (_, i) => `line-${i + 1} some content text`).join("\n")
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("short body paragraph"),
          item.code(longParagraphLike), // triggers clamp + ··· indicator
          item.file("structural-card", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    // Navigate somewhere neutral (structural card) so cursor highlighting
    // doesn't perturb layout.
    app.press("j")
    app.press("j")

    const bodyBox = app.screen.nodeBox(longParagraphLike)
    const structBox = app.screen.nodeBox("structural-card")
    expect(bodyBox, "clamped body block must be registered").not.toBeNull()
    expect(structBox, "structural card must be registered").not.toBeNull()
    const prev = bodyBox!
    const next = structBox!

    // The ··· indicator row is rendered AFTER prev.y + prev.height within the
    // body-card wrapper Box (TreeNode adds it as a sibling of the NodeChildren).
    // Treat the bottom of the body-card wrapper as `prev.y + prev.height + 1`
    // (one extra row for the indicator). Any blank rows between that and the
    // structural card's border row is phantom whitespace.
    expect(app.text, "truncation indicator must be visible").toContain("···")
    const blanks = blankRowsBetween(app, prev.y, prev.height + 1, next.y - 1)
    expect(
      blanks,
      `phantom blank rows after ··· indicator, before structural card: ` +
        `prev.y=${prev.y} prev.h=${prev.height} next.y=${next.y} — ` +
        `got ${blanks} blank rows, expected ≤ 1`,
    ).toBeLessThanOrEqual(1)
  })

  test("truncated body block (with ··· indicator) → structural card leaves at most 1 blank row", () => {
    // Reproduces the exact real-vault scenario: a long body block that
    // triggers the maxRows clamp + ··· indicator, followed by a structural
    // card. The user sees 3-4 blank rows between the ··· and the structural
    // card border in this case.
    const longBody = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`).join("\n")
    using app = createTestApp(
      item("board", item("col", item.code(longBody), item.file("structural-card", item("sc-child")))),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j") // move cursor off the body block so cursor styling doesn't alter layout

    const bodyBox = app.screen.nodeBox(longBody)
    const structBox = app.screen.nodeBox("structural-card")
    expect(bodyBox, "body block must be registered").not.toBeNull()
    expect(structBox, "structural card must be registered").not.toBeNull()
    const prev = bodyBox!
    const next = structBox!

    // Confirm the ··· indicator is on screen (clamp happened).
    expect(app.text, "truncation indicator must be visible").toContain("···")

    // Structural card nodeBox is the inner content; the border row is at next.y-1.
    const blanks = blankRowsBetween(app, prev.y, prev.height, next.y - 1)
    expect(
      blanks,
      `blank rows between truncated body block and structural card top border: ` +
        `prev.y=${prev.y} prev.h=${prev.height} next.y=${next.y} (border at ${next.y - 1}) — ` +
        `got ${blanks} blank rows, expected ≤ 1`,
    ).toBeLessThanOrEqual(1)
  })
})

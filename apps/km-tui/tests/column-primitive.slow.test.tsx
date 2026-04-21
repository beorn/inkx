/**
 * Column-primitive parity tests (bead: km-tui.column-primitive)
 *
 * Characterises the current CardColumn render behaviour across every
 * sibling-pair of the two frame types — bordered structural cards
 * (`<Box borderStyle="round">`) and naked body blocks (unframed
 * `<TreeNode isBody>`). These tests must pass on HEAD (they assert
 * current behaviour), and MUST continue to pass after the Column
 * primitive refactor collapses the two render branches behind a single
 * uniform gap contract.
 *
 * ## Gap contract under test
 *
 * For the current rendering (CardColumn.tsx):
 *
 *   bordered → bordered : 0 blank rows between (borders delimit)
 *   bordered → naked    : 1 blank row   (naked owns `paddingTop=1`)
 *   naked    → naked    : 0 blank rows  (isPrevBodyBlock=true → paddingTop=0)
 *   naked    → bordered : ≤1 blank rows (neither owns padding; border self-delimits)
 *
 * The fourth case has an `≤ 1` bound rather than strict `0` because
 * the structural card's top border sits at `y - 1` relative to its
 * inner content box — so the last content row of a naked block and
 * the top border of the following structural card can abut with zero
 * intervening blank rows OR leave one blank row, depending on how
 * the measurement lands. Either is acceptable; neither is a phantom
 * gap.
 *
 * ## Overflow semantics (documented, not unified)
 *
 * - Bordered cards count HIDDEN CHILDREN (+ grandchildren + title-wrap
 *   lines) and render the count as a `╰─ +N more ─╯` bottom border.
 * - Naked body blocks count HIDDEN ROWS via TreeNode's `maxRows`
 *   contract and render a `···` indicator inside content.
 *
 * These two policies CANNOT unify under a single contract because
 * they count different things. The Column primitive supports both
 * policies per-item; the choice is a property of the card, not of
 * the column.
 */

import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

function blankRowsBetween(
  app: ReturnType<typeof createTestApp>,
  prevY: number,
  prevH: number,
  nextY: number,
): number {
  let blanks = 0
  for (let y = prevY + prevH; y < nextY; y++) {
    const row = app.screen.row(y)
    if (row.trim() === "") blanks++
  }
  return blanks
}

describe("column primitive: gap contract between frame pairs", () => {
  test("bordered → bordered: 0 blank rows between content", () => {
    // Two structural cards abut — the card borders self-delimit.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.file("struct-one", item("child-a")),
          item.file("struct-two", item("child-b")),
        ),
      ),
      { cols: 80, rows: 30, viewMode: "cards" },
    )
    // Move cursor off struct-one so its own selection border doesn't perturb gap.
    app.press("j")

    const a = app.screen.nodeBox("struct-one")
    const b = app.screen.nodeBox("struct-two")
    expect(a, "struct-one must be registered").not.toBeNull()
    expect(b, "struct-two must be registered").not.toBeNull()

    // nodeBox reports the INNER content box. The bordered card's bottom border
    // sits at (a.y + a.h), and the next bordered card's top border sits at
    // (b.y - 1). Between those two border rows there should be ZERO blank
    // rows (the borders abut: prev-bottom touches next-top, or they share a
    // single row in the worst case).
    const prevBottomBorderRow = a!.y + a!.height
    const nextTopBorderRow = b!.y - 1
    const blanks = blankRowsBetween(app, prevBottomBorderRow + 1, 0, nextTopBorderRow)
    expect(
      blanks,
      `bordered→bordered should have 0 blank rows between border rows: ` +
        `a.y=${a!.y} a.h=${a!.height} b.y=${b!.y} — got ${blanks}`,
    ).toBe(0)
  })

  test("bordered → naked: exactly 1 blank row between bordered bottom border and naked top", () => {
    // Column-header → naked is the only way to land on the bordered→naked
    // boundary in today's viewtree classification: body cards are the nodes
    // that appear BEFORE the first structural item, so a body block can
    // never be preceded by a structural card in the same column.
    //
    // To isolate the bordered→naked gap, we reuse the same shape the
    // real-vault @agent column has: body blocks at the top, followed by a
    // structural card. The column header is the "bordered neighbour" above
    // the first body block. We assert the column header's separator row
    // leaves exactly 1 blank row before the first body block.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("first-body"),
          item.file("struct-anchor", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 30, viewMode: "cards" },
    )
    app.press("j") // cursor off first body

    const firstBody = app.screen.nodeBox("first-body")
    expect(firstBody, "first-body must be registered").not.toBeNull()

    // The column header separator row sits above first-body. There should
    // be exactly 1 blank row between the separator and first-body's first
    // content row (the paddingTop=1 the body block owns).
    // Scan upward from first-body.y until we hit a non-blank row — that's
    // the separator. Blank rows between are the leading gap.
    let separatorY = -1
    for (let y = firstBody!.y - 1; y >= 0; y--) {
      if (app.screen.row(y).trim() !== "") {
        separatorY = y
        break
      }
    }
    expect(separatorY, "column separator must exist above first body").toBeGreaterThanOrEqual(0)
    const blanks = firstBody!.y - separatorY - 1
    expect(
      blanks,
      `bordered→naked should leave exactly 1 blank row: ` +
        `separatorY=${separatorY} firstBody.y=${firstBody!.y} — got ${blanks}`,
    ).toBe(1)
  })

  test("naked → naked: 0 blank rows — body blocks abut as stacked prose", () => {
    // The canonical body-block-leading-gap case (bead km-tui.body-block-leading-gap,
    // commit 8e8fac337). Two borderless paragraphs must abut with zero
    // phantom whitespace between them.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("alpha-body-line"),
          item.code("beta-body-line"),
          item.file("structural-anchor", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j") // move cursor off alpha so cursor styling doesn't perturb

    const alpha = app.screen.nodeBox("alpha-body-line")
    const beta = app.screen.nodeBox("beta-body-line")
    expect(alpha, "alpha-body-line must be registered").not.toBeNull()
    expect(beta, "beta-body-line must be registered").not.toBeNull()

    const blanks = blankRowsBetween(app, alpha!.y, alpha!.height, beta!.y)
    expect(
      blanks,
      `naked→naked should abut with 0 blank rows: ` +
        `alpha.y=${alpha!.y} h=${alpha!.height} beta.y=${beta!.y} — got ${blanks}`,
    ).toBe(0)
  })

  test("naked → bordered: ≤1 blank row between body and bordered top border", () => {
    // Body → structural: neither frame owns leading/trailing padding at this
    // boundary. The structural card's own top border delimits; the body's
    // last content row sits one row above. Accepts 0 or 1 blank rows — the
    // bound is "no phantom whitespace", not a strict value.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("alpha-body-line"),
          item.code("beta-body-line"),
          item.file("structural-anchor", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j")

    const beta = app.screen.nodeBox("beta-body-line")
    const anchor = app.screen.nodeBox("structural-anchor")
    expect(beta, "beta-body-line must be registered").not.toBeNull()
    expect(anchor, "structural-anchor must be registered").not.toBeNull()

    // Bordered card's top border row is (anchor.y - 1); blank rows are
    // measured between beta's last content row and that border row.
    const blanks = blankRowsBetween(app, beta!.y, beta!.height, anchor!.y - 1)
    expect(
      blanks,
      `naked→bordered should leave at most 1 blank row: ` +
        `beta.y=${beta!.y} h=${beta!.height} anchor.y=${anchor!.y} — got ${blanks}`,
    ).toBeLessThanOrEqual(1)
  })
})

describe("column primitive: frame interleaving preserves gap contract", () => {
  test("multiple naked blocks → bordered: all naked→naked transitions abut; final naked→bordered ≤1", () => {
    // Viewtree classification: body cards are the siblings that appear
    // BEFORE the first structural item. This means the layout in a single
    // column is always naked-run → bordered-run — never alternating. The
    // real-vault shape is exactly this.
    //
    // We validate that every pair in the naked run abuts with 0 gap, and
    // that the last naked block's transition into the bordered run
    // introduces no phantom whitespace (≤ 1 blank row is acceptable).
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("alpha"),
          item.code("beta"),
          item.code("gamma"),
          item.file("anchor", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j")

    const alpha = app.screen.nodeBox("alpha")
    const beta = app.screen.nodeBox("beta")
    const gamma = app.screen.nodeBox("gamma")
    const anchor = app.screen.nodeBox("anchor")
    expect(alpha).not.toBeNull()
    expect(beta).not.toBeNull()
    expect(gamma).not.toBeNull()
    expect(anchor).not.toBeNull()

    // naked → naked: 0
    expect(
      blankRowsBetween(app, alpha!.y, alpha!.height, beta!.y),
      "alpha→beta (naked→naked)",
    ).toBe(0)
    expect(
      blankRowsBetween(app, beta!.y, beta!.height, gamma!.y),
      "beta→gamma (naked→naked)",
    ).toBe(0)

    // naked → bordered (last body block → first structural): ≤ 1
    expect(
      blankRowsBetween(app, gamma!.y, gamma!.height, anchor!.y - 1),
      "gamma→anchor (naked→bordered)",
    ).toBeLessThanOrEqual(1)
  })

  test("column-header → naked run → bordered run: all transitions respect their rule", () => {
    // The complete canonical shape: column header, then a naked run, then
    // a bordered run. Validates every boundary type in a single column.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("body-first"),
          item.code("body-second"),
          item.file("struct-first", item("sc-1")),
          item.file("struct-second", item("sc-2")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j")

    const bodyFirst = app.screen.nodeBox("body-first")
    const bodySecond = app.screen.nodeBox("body-second")
    const structFirst = app.screen.nodeBox("struct-first")
    const structSecond = app.screen.nodeBox("struct-second")
    expect(bodyFirst).not.toBeNull()
    expect(bodySecond).not.toBeNull()
    expect(structFirst).not.toBeNull()
    expect(structSecond).not.toBeNull()

    // column-header → naked: exactly 1 blank row
    let separatorY = -1
    for (let y = bodyFirst!.y - 1; y >= 0; y--) {
      if (app.screen.row(y).trim() !== "") {
        separatorY = y
        break
      }
    }
    expect(separatorY).toBeGreaterThanOrEqual(0)
    expect(bodyFirst!.y - separatorY - 1, "header→naked").toBe(1)

    // naked → naked
    expect(
      blankRowsBetween(app, bodyFirst!.y, bodyFirst!.height, bodySecond!.y),
      "naked→naked",
    ).toBe(0)

    // naked → bordered (≤1)
    expect(
      blankRowsBetween(app, bodySecond!.y, bodySecond!.height, structFirst!.y - 1),
      "naked→bordered",
    ).toBeLessThanOrEqual(1)

    // bordered → bordered (0 between border rows)
    const gapBB = blankRowsBetween(
      app,
      structFirst!.y + structFirst!.height + 1,
      0,
      structSecond!.y - 1,
    )
    expect(gapBB, "bordered→bordered").toBe(0)
  })

  test("all-naked column: every pair abuts with 0 blank rows", () => {
    // Pure-prose column — the @agent.md real-vault shape. Every body block
    // must abut its neighbour; no phantom rows anywhere.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("alpha"),
          item.code("beta"),
          item.code("gamma"),
          item.code("delta"),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j")

    const ids = ["alpha", "beta", "gamma", "delta"] as const
    const boxes = ids.map((id) => {
      const box = app.screen.nodeBox(id)
      expect(box, `body block "${id}" must be registered`).not.toBeNull()
      return box!
    })
    for (const [idx, next] of boxes.slice(1).entries()) {
      const prev = boxes[idx]!
      const blanks = blankRowsBetween(app, prev.y, prev.height, next.y)
      expect(
        blanks,
        `naked→naked gap between "${ids[idx]}" and "${ids[idx + 1]}": got ${blanks}`,
      ).toBe(0)
    }
  })

  test("all-bordered column: every pair abuts via borders with 0 blank rows", () => {
    // Classic kanban shape — a column of structural cards. Each card's
    // border self-delimits; no extra spacing between border rows.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.file("one", item("c1")),
          item.file("two", item("c2")),
          item.file("three", item("c3")),
        ),
      ),
      { cols: 80, rows: 30, viewMode: "cards" },
    )
    app.press("j")
    app.press("j") // settle off first card

    const one = app.screen.nodeBox("one")
    const two = app.screen.nodeBox("two")
    const three = app.screen.nodeBox("three")
    expect(one, "one must be registered").not.toBeNull()
    expect(two, "two must be registered").not.toBeNull()
    expect(three, "three must be registered").not.toBeNull()

    // Between each pair: 0 blank rows between bordered content boxes (after
    // the previous card's bottom border and before the next card's top border).
    for (const [prev, next, label] of [
      [one!, two!, "one→two"],
      [two!, three!, "two→three"],
    ] as const) {
      const prevBottomBorder = prev.y + prev.height
      const nextTopBorder = next.y - 1
      const blanks = blankRowsBetween(app, prevBottomBorder + 1, 0, nextTopBorder)
      expect(blanks, `${label}: got ${blanks}`).toBe(0)
    }
  })
})

describe("column primitive: overflow semantics (two policies, not unified)", () => {
  test("bordered card with hidden children renders `+N more` in bottom border", () => {
    // Structural overflow policy: counts HIDDEN CHILDREN (+ grandchildren +
    // title-wrap lines). Rendered as a custom `╰─ +N more ─╯` bottom border
    // row. This is distinct from the row-budget policy used by body blocks.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.file(
            "big-card",
            item("c1"),
            item("c2"),
            item("c3"),
            item("c4"),
            item("c5"),
            item("c6"),
            item("c7"),
            item("c8"),
          ),
        ),
      ),
      { cols: 80, rows: 20, viewMode: "cards" },
    )

    // Move cursor OFF big-card so the card is not expanded (cursor-in-descendant
    // triggers full expansion). Pressing "k" from first child moves cursor
    // up to the column header (cursor_up handler) — which leaves big-card
    // collapsed.
    app.press("k")

    // The bottom border with the overflow count should render somewhere.
    // The exact number depends on maxContentLines config, but the format
    // `+N more` must appear.
    expect(app.text, "bordered card overflow uses `+N more` border").toMatch(/\+\d+ more/)
  })

  test("naked body block exceeding row budget renders `···` indicator", () => {
    // Body overflow policy: counts WRAPPED ROWS via TreeNode's maxRows +
    // overflowIndicator contract. Rendered as a `···` inside the content
    // area.
    const longBody = Array.from({ length: 40 }, (_, i) => `line-${i + 1} — content`).join("\n")
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code(longBody),
          item.file("anchor-struct", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 40, viewMode: "cards" },
    )
    app.press("j") // move cursor off the body block so clamp applies

    expect(app.text, "naked body overflow uses `···` indicator").toContain("···")
  })
})

describe("column primitive: selection tint continuity across frame boundaries", () => {
  test("naked block's leading gap row inherits body bg when body is cursor", () => {
    // Invariant at the header→naked boundary: the naked block's leading
    // paddingTop=1 row fills with the body's bg. When the cursor is on the
    // body card, the selection tint forms a single continuous surface
    // including the gap row — no visual break between gap and content.
    //
    // This is why the leading gap is applied as padding INSIDE the body
    // card's Box (not as a separate Column-level spacer): padding inherits
    // the Box's bg, a sibling spacer would not.
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item.code("selected-body"),
          item.file("struct-anchor", item("sc-child")),
        ),
      ),
      { cols: 80, rows: 30, viewMode: "cards" },
    )

    // Cursor starts on first visible card — which is selected-body (the
    // topmost body block in the naked run).
    expect(app.card("selected-body").isCursor, "cursor should be on selected-body").toBe(true)

    const naked = app.screen.nodeBox("selected-body")
    expect(naked, "selected-body must be registered").not.toBeNull()

    // The leading gap row is at (naked.y - 1). When body is cursor, that row
    // should inherit the body block's selection bg — i.e. NOT be uniformly
    // the default bg. We sample several columns on that row and require at
    // least one to have a non-default bg.
    const gapY = naked!.y - 1
    expect(gapY, "gap row must be above the naked content").toBeGreaterThanOrEqual(0)

    let tintedCells = 0
    for (let dx = 0; dx < Math.min(naked!.width, 20); dx++) {
      const cell = app.screen.cell(naked!.x + dx, gapY)
      if (cell && cell.bg && cell.bg !== 0) tintedCells++
    }
    expect(
      tintedCells,
      `gap row at y=${gapY} should inherit body bg when body is cursor (got ${tintedCells} tinted cells)`,
    ).toBeGreaterThan(0)
  })
})

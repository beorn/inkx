/**
 * Regression: swapping an ENTIRE component tree at the same layout position
 * leaves stale border/content cells from the old tree.
 *
 * Symptom (examples/bin/cli.ts demo cycling): switching demo 2
 * (borderStyle="single" ┌─┐) to demo 3 (borderStyle="round" ╭─╮) left the
 * OLD single-border top row visible behind the new round border at the same
 * cell position — a stacked-border artifact. Reproduced later in silvercode
 * as cascading corruption after closing /history over an active chat.
 *
 * The prop-change path (same tree, borderStyle prop flips) was verified
 * clean at the time; the bug shape is specifically CONDITIONAL SUBTREE
 * REPLACEMENT — tree A unmounts, structurally different tree B mounts at
 * the same position — exercising the dirty-flag cascade for mount/unmount
 * at the same layout slot. Sibling specs cover the adjacent shapes:
 * modal-dismiss-no-ghost (overlay unmount → reflow) and
 * popover-unmount-bg-residue (absolute-child unmount). This file covers
 * the in-flow replacement shape.
 *
 * Verification: every swap frame runs under the suite-default
 * SILVERY_STRICT=1 (incremental ≡ fresh auto-check); on top of that, the
 * post-swap buffer is compared cell-for-cell against a FRESH renderer that
 * only ever mounted the target tree — the strongest "no cells survived
 * from the old tree" oracle, independent of STRICT internals.
 *
 * Bead: km-silvery.tree-swap-border-bleed (@km/silvery/14224).
 */
import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"

/**
 * Pin a SILVERY_STRICT value for one renderer lifecycle. The suite default
 * is tier 1 (incremental ≡ fresh); the tier-2 `residue` slug additionally
 * poisons the prev buffer with a sentinel so "cascade skipped a cell it
 * should have repainted" cannot hide behind a coincidentally-matching
 * prev pixel. Same pattern as applybg-clip-to-visible-region.test.tsx.
 */
function withStrict<T>(value: string, fn: () => T): T {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = value
  resetStrictCache()
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
}

beforeEach(() => resetStrictCache())
afterEach(() => resetStrictCache())

const COLS = 60
const ROWS = 16

/** Demo-2 shape: single-border box, one line of content. */
function TreeA(): React.ReactElement {
  return (
    <Box flexDirection="column" width={COLS} height={ROWS}>
      <Box borderStyle="single" flexDirection="column" width={40}>
        <Text>Demo two — single border content</Text>
      </Box>
    </Box>
  )
}

/** Demo-3 shape: structurally different — round border, two paragraphs, narrower. */
function TreeB(): React.ReactElement {
  return (
    <Box flexDirection="column" width={COLS} height={ROWS}>
      <Box borderStyle="round" flexDirection="column" width={32}>
        <Text>Demo three — round border</Text>
        <Text wrap="wrap">Second paragraph that wraps across lines.</Text>
      </Box>
    </Box>
  )
}

/** Taller tree: shrink-on-swap must clear the rows the new tree no longer covers. */
function TreeTall(): React.ReactElement {
  return (
    <Box flexDirection="column" width={COLS} height={ROWS}>
      <Box borderStyle="double" flexDirection="column" width={50} height={12}>
        <Text>Tall double-border tree</Text>
        <Text>row 2</Text>
        <Text>row 3</Text>
        <Text>row 4</Text>
      </Box>
    </Box>
  )
}

function App({ which }: { which: "a" | "b" | "tall" }): React.ReactElement {
  if (which === "a") return <TreeA />
  if (which === "tall") return <TreeTall />
  return <TreeB />
}

type SnapshotCell = { char: string; bg: { r: number; g: number; b: number } | null }

function snapshotCells(
  app: { cell: (col: number, row: number) => SnapshotCell },
  cols: number,
  rows: number,
): string[] {
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ""
    for (let x = 0; x < cols; x++) {
      line += app.cell(x, y).char || " "
    }
    lines.push(line)
  }
  return lines
}

/**
 * Bg-plane sibling of snapshotCells. Stale-cell bugs in this class can
 * manifest as BG-ONLY residue (the popover-unmount shape: no border chars,
 * no content chars, just leftover fill) which a char-plane compare cannot
 * see. One compact token per cell: "." for no bg, "r,g,b" otherwise.
 */
function snapshotBg(
  app: { cell: (col: number, row: number) => SnapshotCell },
  cols: number,
  rows: number,
): string[] {
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    const row: string[] = []
    for (let x = 0; x < cols; x++) {
      const bg = app.cell(x, y).bg
      row.push(bg ? `${bg.r},${bg.g},${bg.b}` : ".")
    }
    lines.push(row.join(" "))
  }
  return lines
}

/** Fresh-render oracle: what a renderer that ONLY ever saw `which` produces. */
function freshSnapshot(which: "a" | "b" | "tall"): { chars: string[]; bg: string[] } {
  const render = createRenderer({ cols: COLS, rows: ROWS })
  const app = render(<App which={which} />)
  return { chars: snapshotCells(app, COLS, ROWS), bg: snapshotBg(app, COLS, ROWS) }
}

/** Assert both planes of `app` match the fresh oracle, with readable diffs. */
function expectMatchesFresh(
  app: { cell: (col: number, row: number) => SnapshotCell },
  which: "a" | "b" | "tall",
  label: string,
): void {
  const chars = snapshotCells(app, COLS, ROWS)
  const bg = snapshotBg(app, COLS, ROWS)
  const fresh = freshSnapshot(which)
  for (let y = 0; y < ROWS; y++) {
    expect(chars[y], `${label}: char row ${y} differs from fresh render`).toBe(fresh.chars[y])
    expect(bg[y], `${label}: bg row ${y} differs from fresh render (bg-only residue)`).toBe(
      fresh.bg[y],
    )
  }
}

describe("regression: full tree swap at same position leaves no stale cells", () => {
  test("single-border tree → round-border tree: no old border glyphs survive", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<App which="a" />)
    expect(app.text).toContain("Demo two")

    app.rerender(<App which="b" />)

    // Strongest oracle: char + bg planes equal to a renderer that only mounted TreeB.
    expectMatchesFresh(app, "b", "after swap")

    // Readable headline assertions: the OLD single-border glyphs are gone.
    const joined = snapshotCells(app, COLS, ROWS).join("\n")
    expect(joined, "stale single-border corner ┌").not.toContain("┌")
    expect(joined, "stale single-border corner ┐").not.toContain("┐")
    expect(joined, "stale content from unmounted tree").not.toContain("Demo two")
  })

  test("swap cycle a→b→a returns exactly to the original frame", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<App which="a" />)
    const baseline = snapshotCells(app, COLS, ROWS)
    const baselineBg = snapshotBg(app, COLS, ROWS)

    for (let i = 0; i < 3; i++) {
      app.rerender(<App which="b" />)
      app.rerender(<App which="a" />)
    }
    const after = snapshotCells(app, COLS, ROWS)
    const afterBg = snapshotBg(app, COLS, ROWS)
    for (let y = 0; y < ROWS; y++) {
      expect(after[y], `char row ${y} differs from baseline after swap cycles`).toBe(baseline[y])
      expect(afterBg[y], `bg row ${y} differs from baseline after swap cycles`).toBe(baselineBg[y])
    }
  })

  test("swap cycle stays clean under STRICT=2 (residue sentinel poison active)", () => {
    withStrict("2", () => {
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const app = render(<App which="a" />)

      // Each rerender below runs the full tier-2 check set, including
      // `residue` (prev-buffer sentinel poison): any cell the incremental
      // cascade wrongly skips over the vanished tree's rect throws here
      // even if its stale content coincidentally matches fresh output.
      app.rerender(<App which="b" />)
      app.rerender(<App which="tall" />)
      app.rerender(<App which="b" />)
      expectMatchesFresh(app, "b", "after swaps under STRICT=2")
    })
  })

  test("tall tree → short tree: vacated rows are cleared, not left stale", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<App which="tall" />)
    expect(app.text).toContain("Tall double-border tree")

    app.rerender(<App which="b" />)

    expectMatchesFresh(app, "b", "after shrink-swap")

    const joined = snapshotCells(app, COLS, ROWS).join("\n")
    expect(joined, "stale double-border glyph ═ from unmounted tall tree").not.toContain("═")
    expect(joined, "stale double-border glyph ║ from unmounted tall tree").not.toContain("║")
    expect(joined, "stale content row from unmounted tall tree").not.toContain("row 4")
  })
})

/**
 * Golden cell-snapshot regression test for a checked-in vault at full-app
 * dimensions. Bead: `@km/all/test-system/real-vault-golden-snapshot` (P2).
 *
 * The intent is "any rendering regression visible to the user fails CI". STRICT
 * + canary + residue catch broad classes of bugs already; this test is the
 * brute-force complement that pins the actual painted cells. If a future change
 * shifts a card title left by one column, drops a priority badge, or swaps a
 * theme token's resolved RGB, the snapshot diff surfaces it cell by cell.
 *
 * What it does:
 * 1. Loads `apps/km-tui/tests/fixtures/golden-vault/` — a small, deterministic
 *    kanban (5 columns × 6-7 cards each, mixed inline content: links, tags,
 *    hashtags, priorities, code spans, mentions, wikilinks). Column order is
 *    pinned via `.km/sibling-order.json`; node IDs are ULIDs (non-deterministic
 *    on the wire) but never appear in rendered cells.
 * 2. Mounts the full BoardApp through `testBoard` at 360 × 120 — the dense
 *    full-app geometry where layout regressions surface (cf. cyan-strip).
 * 3. Synchronously parses deferred markdown stubs so the snapshot captures
 *    real card content rather than the loading-skeleton placeholders the
 *    production discoverOnly path renders before the background parse lands.
 * 4. Serializes every cell (`char + bg + fg + attrs`) into a stable
 *    text-block + per-row style-run format and asserts byte-identical match
 *    via `toMatchFileSnapshot`. The golden file lives next to this test as
 *    `golden-vault-frame.golden.txt`.
 *
 * Updating the snapshot: when the change is intentional, run
 *
 *     bun vitest run --update apps/km-tui/tests/golden-vault-frame.slow.spec.ts
 *
 * inspect the diff (it's plain text, line-oriented), and commit.
 *
 * Determinism notes:
 *   - The fixture vault checks in NO `state.db*` — the test deletes any stale
 *     copy at start so every run is a cold load.
 *   - Cell serialization deliberately strips nothing visible. Node IDs and
 *     timestamps live in the DB only; they never reach a painted cell.
 *   - The cursor lands on the first card of the first column ("Inbox" → first
 *     list item) deterministically because `testBoard` derives the initial
 *     cursor from the lens.
 */

import { describe, test, beforeAll, expect } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { testBoard } from "./helpers/real-board.ts"
import type { App } from "@silvery/test"

const VAULT = resolve(import.meta.dirname, "fixtures/golden-vault")
const KM_DIR = resolve(VAULT, ".km")

/**
 * Column order, pinned for determinism. Written into the fixture's
 * `.km/sibling-order.json` from `beforeAll` because the repo-wide
 * `.gitignore` excludes `.km/` and we want the fixture to stay
 * self-contained — no negation games.
 */
const COLUMN_ORDER = ["Inbox.md", "Active.md", "Blocked.md", "Review.md", "Done.md"]

interface RGB {
  r: number
  g: number
  b: number
}

/** Compact RGB rendering: `255,128,0` or `-` for null. */
function fmtColor(c: RGB | null): string {
  if (c === null) return "-"
  return `${c.r},${c.g},${c.b}`
}

/**
 * One-character shorthand for the cell's style attributes. Builds a stable,
 * diff-friendly string like `B` (bold), `Bi` (bold + italic), `Iu` (inverse +
 * underline), `-` (no attrs). Order is fixed so `Bi` is always `Bi`, never
 * `iB`. We don't capture wide / continuation / hyperlink — they're either
 * implied by the character itself or not load-bearing for visual regression.
 */
function fmtAttrs(cell: ReturnType<App["cell"]>): string {
  const a: string[] = []
  if (cell.bold) a.push("B")
  if (cell.dim) a.push("d")
  if (cell.italic) a.push("i")
  if (cell.underline !== false) a.push("u")
  if (cell.overline) a.push("o")
  if (cell.strikethrough) a.push("s")
  if (cell.inverse) a.push("I")
  if (cell.blink) a.push("k")
  if (cell.hidden) a.push("h")
  return a.length === 0 ? "-" : a.join("")
}

/** True if the cell uses ONLY default styling — no fg, no bg, no attrs. */
function isDefaultStyled(cell: ReturnType<App["cell"]>): boolean {
  if (cell.fg !== null) return false
  if (cell.bg !== null) return false
  return fmtAttrs(cell) === "-"
}

/**
 * Build a stable cell-snapshot from a rendered App.
 *
 * Output shape (text concatenated with \n):
 *
 *     360x120  (geometry header)
 *     --- text ---
 *     <row 0 plain text, trimmed-right>
 *     <row 1 plain text, trimmed-right>
 *     …
 *     --- styles ---
 *     R0  c0..c5 fg=- bg=12,34,56 attr=B
 *     R0  c6..c10 fg=255,255,255 bg=- attr=-
 *     R5  c2..c8 fg=128,0,0 bg=- attr=-
 *     …
 *     (rows with no non-default styling are omitted)
 *
 * Each style "run" is a maximal horizontal stretch of cells whose
 * (fg, bg, attrs) tuple is identical AND non-default. Default-styled cells
 * break runs but are not themselves emitted, so a row whose only styled
 * area is e.g. a column header produces one short run line — not 360
 * columns of `-`. This keeps the file legible.
 */
function serializeFrame(app: App): string {
  const w = app.width
  const h = app.height
  const lines: string[] = []
  lines.push(`${w}x${h}`)
  lines.push("--- text ---")

  // Plain text rows — `app.lines` is the canonical pre-trimmed text grid.
  for (let row = 0; row < h; row++) {
    const line = app.lines[row] ?? ""
    // Trim trailing spaces — they don't carry visual signal and just bloat
    // the snapshot. Style runs preserve column positions exactly.
    lines.push(line.replace(/ +$/, ""))
  }

  lines.push("--- styles ---")

  for (let row = 0; row < h; row++) {
    let runStart = -1
    let runFg = "-"
    let runBg = "-"
    let runAttr = "-"
    const flushRun = (endExclusive: number) => {
      if (runStart < 0) return
      lines.push(`R${row}  c${runStart}..c${endExclusive - 1} fg=${runFg} bg=${runBg} attr=${runAttr}`)
      runStart = -1
    }
    for (let col = 0; col < w; col++) {
      const cell = app.cell(col, row)
      if (isDefaultStyled(cell)) {
        flushRun(col)
        continue
      }
      const fg = fmtColor(cell.fg)
      const bg = fmtColor(cell.bg)
      const attr = fmtAttrs(cell)
      if (runStart < 0) {
        runStart = col
        runFg = fg
        runBg = bg
        runAttr = attr
        continue
      }
      if (fg !== runFg || bg !== runBg || attr !== runAttr) {
        flushRun(col)
        runStart = col
        runFg = fg
        runBg = bg
        runAttr = attr
      }
    }
    flushRun(w)
  }

  return lines.join("\n") + "\n"
}

describe("golden vault: cell-level frame snapshot (360x120)", () => {
  beforeAll(() => {
    // Remove anything an earlier run left in `.km/` so every CI run is a
    // cold-load with a deterministic column order. We rewrite
    // `sibling-order.json` ourselves below — `.km/` is in the repo-wide
    // gitignore, so the source-of-truth lives in this test file, not on
    // disk.
    if (existsSync(KM_DIR)) rmSync(KM_DIR, { recursive: true, force: true })
    mkdirSync(KM_DIR, { recursive: true })
    writeFileSync(resolve(KM_DIR, "sibling-order.json"), JSON.stringify({ ".": COLUMN_ORDER }, null, 2) + "\n")
  })

  test("kanban frame matches golden", async () => {
    const board = await testBoard(VAULT, {
      columns: 360,
      rows: 120,
      parseDeferred: true,
    })

    const frame = serializeFrame(board._result)

    // File-based snapshot — diffs read row by row + style-run by style-run.
    // When the snapshot fails, scan the diff for the row(s) that changed and
    // cross-reference the visible board via `bun km view <fixture>`.
    await expect(frame).toMatchFileSnapshot("./__snapshots__/golden-vault-frame.golden.txt")
  })
})

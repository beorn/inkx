/**
 * Regression: pale-cyan / light-blue 1-row strips appearing inside cards
 * across the kanban board in `km view ~/Bear/Vault`.
 *
 * Bead: @km/silvery/render-light-blue-bg-strip-residue (P1, 2026-05-05).
 *
 * What the user sees: ~10-15 horizontal 1-row strips in pale cyan-ish
 * blue at varying y-positions across multiple cards in a 13-column
 * kanban at 352 × 117. Strongly suggests stale `$bg-selected` rows
 * (Nord selectionBackground = #4C566A ≈ rgb(76,86,106) — a blue-grey)
 * left behind as the cursor moves through cards without clearing the
 * previous row's highlight.
 *
 * Strategy:
 * 1. Drive a real-vault board at the user's exact terminal size (352×117).
 * 2. Walk the cursor through MANY positions — every new cursor row paints
 *    `$bg-selected` (and `$bg-cursor` near-white on the title cell).
 * 3. After settling on a final cursor, scan the rendered frame for any
 *    `bg-selected`-colored cells that aren't part of the current cursor's
 *    card. Those are residue.
 *
 * SILVERY_STRICT=1 (vendor default) is also checked per-action for
 * incremental === fresh divergence.
 */

import { describe, test, expect } from "vitest"
import { existsSync } from "node:fs"
import { testBoard, type TestBoardResult } from "./helpers/real-board.ts"

const REAL_VAULT = "/Users/beorn/Bear/Vault"
const haveVault = existsSync(REAL_VAULT)

interface RGB {
  r: number
  g: number
  b: number
}
interface CellHit {
  col: number
  row: number
  bg: RGB
  char: string
}

/**
 * "Pale-cyan / blue-grey strip" detector.
 *
 * The bg-selected strip in Nord is rgb(76,86,106) — green and blue dominate
 * red, slight blue lift over green. The screenshot shows variants of this
 * tone (potentially blended with darker bg from incremental render leaks).
 *
 * Match envelope:
 *   - non-null bg
 *   - g > r + 5 AND b > r + 5  (green/blue dominate red — bluish/cyan)
 *   - b >= g - 6                (no green-only, e.g. lime)
 *   - sum(r+g+b) between 180..360  (rules out pitch black & near-white)
 *
 * This catches both Nord bg-selected rgb(76,86,106) and broader cyan family
 * (e.g. Sterling derived $bg-cursor / $border-focus accents in non-Nord).
 */
function isStripColor(bg: RGB | null): boolean {
  if (!bg) return false
  const { r, g, b } = bg
  if (g <= r + 5) return false
  if (b <= r + 5) return false
  if (b < g - 6) return false
  const sum = r + g + b
  if (sum < 180 || sum > 360) return false
  return true
}

function findStripRuns(board: TestBoardResult): CellHit[][] {
  const app = board._result
  const cols = app.width
  const rows = app.height
  const runs: CellHit[][] = []

  for (let row = 0; row < rows; row++) {
    let current: CellHit[] = []
    for (let col = 0; col < cols; col++) {
      const cell = app.cell(col, row)
      const bg = cell.bg as RGB | null
      if (isStripColor(bg)) {
        current.push({ col, row, bg: bg!, char: cell.char })
      } else {
        if (current.length >= 4) runs.push(current)
        current = []
      }
    }
    if (current.length >= 4) runs.push(current)
  }
  return runs
}

/**
 * Group strip-color runs into vertically-contiguous rectangles. A rectangle
 * is a stack of runs at the same column range on consecutive rows; this is
 * what the cursor card's bg-selected body looks like — N rows tall, one
 * column wide.
 *
 * Stale residue, in contrast, is an isolated 1-row strip (or a thin
 * fragment) inside a card whose cursor moved away — the previous cursor
 * row's bg-selected paint that didn't get cleared on the next frame. The
 * suspiciousness check below filters out tall rectangles (the legitimate
 * cursor card) and keeps only short, isolated runs.
 */
interface Rect {
  row0: number
  row1: number
  col0: number
  col1: number
  hits: CellHit[]
}

function groupIntoRects(runs: CellHit[][]): Rect[] {
  const sorted = [...runs].sort((a, b) => a[0]!.row - b[0]!.row || a[0]!.col - b[0]!.col)
  const open: Rect[] = []
  const closed: Rect[] = []
  for (const run of sorted) {
    const first = run[0]!
    const last = run[run.length - 1]!
    let merged = false
    for (let i = 0; i < open.length; i++) {
      const r = open[i]!
      if (r.row1 + 1 === first.row && r.col0 === first.col && r.col1 === last.col) {
        r.row1 = first.row
        r.hits.push(...run)
        merged = true
        break
      }
    }
    if (!merged) {
      // Close any open rects that didn't get extended on this row.
      for (let i = open.length - 1; i >= 0; i--) {
        const r = open[i]!
        if (r.row1 < first.row - 1) {
          closed.push(r)
          open.splice(i, 1)
        }
      }
      open.push({ row0: first.row, row1: first.row, col0: first.col, col1: last.col, hits: [...run] })
    }
  }
  closed.push(...open)
  return closed
}

/**
 * A rectangle is suspicious if:
 *   - it is short (1-2 rows tall — a legitimate cursor card has 4+ body rows)
 *   - it is below the header / status bar
 *   - it is not chrome (mostly text characters, not box-drawing)
 *   - its width is at least 6 columns
 *   - its row does NOT contain the cursor (legitimate selection highlight)
 *
 * The cursor card's bg-selected body is tall (>= 3 rows) and gets filtered
 * out. The current cursor sub-item paints a 1-row-tall stripe of bg-selected
 * — also legitimate. A genuine residue strip is exactly 1 row tall in the
 * middle of a non-cursor area: bg-selected paint surviving from a previous
 * cursor row that wasn't cleared on the next frame.
 */
function suspiciousRects(rects: Rect[], cursorRows: Set<number>): Rect[] {
  return rects.filter((r) => {
    if (r.row0 <= 1) return false
    if (r.row1 - r.row0 >= 2) return false // tall rect = legitimate cursor card body
    if (r.col1 - r.col0 < 5) return false // require >= 6 cols width
    // Skip rows where the cursor lives — that's a legitimate highlight.
    for (let row = r.row0; row <= r.row1; row++) {
      if (cursorRows.has(row)) return false
    }
    let textChars = 0
    for (const c of r.hits) {
      if (c.char === " ") {
        textChars++
        continue
      }
      const code = c.char.codePointAt(0) ?? 0
      if (code >= 0x2500 && code <= 0x259f) continue // box drawing
      textChars++
    }
    return textChars >= r.hits.length - 1
  })
}

/**
 * Find rows that contain the current cursor — the AutoLocator points us at
 * the `data-cursor` element; any row inside its rect should be exempt from
 * the residue scan because it's where the cursor highlight LIVES.
 */
function cursorRows(board: TestBoardResult): Set<number> {
  const rows = new Set<number>()
  const cursors = board.q("[data-cursor]")
  // resolveAll() may not be present in all locator builds — fall back to
  // walking via boundingBox of the first hit; for our purposes we just need
  // to bracket "cursor area" rows.
  const all = (cursors as { resolveAll?: () => unknown[] }).resolveAll?.() ?? []
  const rects: Array<{ y: number; height: number }> = []
  for (const node of all as Array<{ boxRect?: { y: number; height: number } }>) {
    const r = node.boxRect
    if (r && typeof r.y === "number" && typeof r.height === "number") {
      rects.push({ y: r.y, height: r.height })
    }
  }
  if (rects.length === 0) {
    // Fall back to the boundingBox helper on the locator itself.
    const bb = (cursors as { boundingBox?: () => { y: number; height: number } | null }).boundingBox?.()
    if (bb) rects.push(bb)
  }
  for (const r of rects) {
    for (let row = r.y; row < r.y + r.height; row++) rows.add(row)
  }
  return rows
}

describe.skipIf(!haveVault)("render: light-blue strip residue (real vault, 352x117)", () => {
  test("cursor walk does not leave bg-selected residue strips", async () => {
    const board = await testBoard(REAL_VAULT, { columns: 352, rows: 117 })

    const formatHits = (label: string, sus: Rect[]): string => {
      const head = sus.slice(0, 12).map((r) => {
        const first = r.hits[0]!
        const sample = r.hits.map((c) => c.char).join("")
        return (
          `  rows=${r.row0}..${r.row1} cols=${r.col0}..${r.col1} ` +
          `bg=rgb(${first.bg.r},${first.bg.g},${first.bg.b}) ` +
          `chars=${JSON.stringify(sample.slice(0, 40))}`
        )
      })
      return (
        `[${label}] ${sus.length} suspicious rect(s):\n` +
        head.join("\n") +
        (sus.length > 12 ? `\n  …and ${sus.length - 12} more` : "")
      )
    }

    const scan = (): Rect[] => suspiciousRects(groupIntoRects(findStripRuns(board)), cursorRows(board))

    // Pre-action sweep — initial frame should have zero short residue rects.
    // The cursor card's full body is tall (>= 3 rows) and gets filtered.
    const baseline = scan()
    if (baseline.length > 0) {
      throw new Error(formatHits("baseline (initial frame already has stale strip(s))", baseline))
    }

    // Long action sequence — at 352x117 a single 'l' moves through 1 column
    // (13 visible) and 'j' steps cards. We touch many cursor positions so
    // each row gets painted with bg-selected at some point.
    const presses: string[] = []

    // 1) Walk every column rightwards, then back.
    for (let i = 0; i < 14; i++) presses.push("l")
    for (let i = 0; i < 14; i++) presses.push("h")

    // 2) Walk down + up to paint many cursor rows.
    for (let i = 0; i < 30; i++) presses.push("j")
    for (let i = 0; i < 30; i++) presses.push("k")

    // 3) Diagonal walks across the kanban.
    for (let i = 0; i < 20; i++) presses.push("l", "j")
    for (let i = 0; i < 20; i++) presses.push("h", "k")

    // 4) Edit-mode toggles on many cards (outline draws + clears).
    for (let i = 0; i < 8; i++) presses.push("i", "Escape", "j", "l")

    // 5) Fold/unfold cycles change layout drastically.
    for (let i = 0; i < 4; i++) presses.push("H", "L")

    // 6) View mode cycle — fundamentally restructures the tree.
    presses.push("v", "m")
    for (let i = 0; i < 6; i++) presses.push("j")
    presses.push("v", "m")
    for (let i = 0; i < 6; i++) presses.push("k")

    // 7) Edit toggles after view-mode change.
    for (let i = 0; i < 6; i++) presses.push("i", "Escape", "l")

    // 8) Final cleanup walk to scrub residue.
    for (let i = 0; i < 40; i++) presses.push("j")
    for (let i = 0; i < 40; i++) presses.push("k")

    let firstHitMsg = ""
    let firstHitAt = -1
    for (let i = 0; i < presses.length; i++) {
      board.press(presses[i]!)
      const sus = scan()
      if (sus.length > 0 && firstHitAt === -1) {
        firstHitAt = i
        firstHitMsg = formatHits(`after press[${i}]=${presses[i]}`, sus)
      }
    }

    if (firstHitAt !== -1) {
      throw new Error(`Stale bg-selected strips first detected at press[${firstHitAt}]:\n${firstHitMsg}`)
    }

    // Sanity — make sure we actually rendered something.
    expect(board._result.text.length).toBeGreaterThan(1000)
  }, 240_000)
})

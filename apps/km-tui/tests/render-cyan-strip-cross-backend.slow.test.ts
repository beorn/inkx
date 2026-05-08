/**
 * Cross-backend probe for the light-blue / cyan 1-row strip residue bug.
 *
 * Bead: @km/silvery/render-light-blue-bg-strip-residue (P1, Round 5).
 *
 * Round 4 found that silvery's logical buffer at 360x120 is **clean** — zero
 * cyan cells outside the cursor card. So the bug is downstream of the buffer:
 * either in silvery's ANSI emission, or in Ghostty's interpretation of those
 * bytes, or in Ghostty WASM ≠ Ghostty native.
 *
 * This test isolates the **ANSI emit + terminal interpretation** stage:
 *
 *   1. Mount the real km-tui kanban at 360x120 against the golden vault.
 *   2. Snapshot the silvery TerminalBuffer once and emit it as a single
 *      "paint the whole frame" ANSI string via `bufferToStyledText`.
 *   3. Feed those bytes into BOTH an xterm.js backend and a Ghostty WASM
 *      backend (cell grids both sized 360x120).
 *   4. Walk every cell. For any cell where xterm's `bg` differs from
 *      Ghostty's `bg`, log position + char + both bgs. If the divergence
 *      pattern matches the user's screenshot (1-row pale-cyan strips at
 *      row boundaries), the bug is **Ghostty's ANSI interpretation**.
 *
 * Outcomes:
 *   (a) FAIL with diverging cells → Ghostty parser / silvery emit edge case.
 *       Test prints the offending byte window for further analysis.
 *   (b) PASS with both backends agreeing → bug is downstream of WASM cell
 *       grid (real Ghostty native vs Ghostty WASM divergence, OR my detector
 *       false-positive). Escalate accordingly.
 *
 * Important caveats / design choices:
 *
 * - We use `bufferToStyledText` (deep import from ag-term) rather than the
 *   public `app.ansi` getter because we need `trimTrailingWhitespace: false`
 *   and `trimEmptyLines: false` so trailing-bg paints (the candidate
 *   suspect — bg-selected runs that end in spaces) survive. `app.ansi`
 *   trims by default, which would hide exactly the bytes we're hunting.
 * - `bufferToStyledText` is the "paint a whole frame from scratch" path —
 *   no cursor positioning, no diff. That's intentional: this probes the
 *   **first paint** at cold start, which matches the user's symptom
 *   ("strips visible at zero interaction").
 * - We do NOT use `SILVERY_CAPTURE_OUTPUT` because testBoard goes through
 *   `createRenderer`, not the `run()` scheduler that emits via output-phase.
 *   The buffer-snapshot path is equivalent for our hypothesis (does the
 *   same ANSI stream produce different cell grids in the two backends).
 * - Ghostty WASM is async-init: `beforeAll(initGhostty)` mirrors
 *   `vendor/termless/tests/cross-backend.test.ts:17-19`.
 * - `using` cleanup is wired through `afterEach` because the backends
 *   expose `destroy()` rather than `Symbol.dispose`. Ghostty WASM leaks
 *   memory between instances, so destroying every test is mandatory.
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { testBoard } from "./helpers/real-board.ts"
import { bufferToStyledText } from "@silvery/ag-term/buffer"
import { createXtermBackend } from "@termless/xtermjs"
import { createGhosttyBackend, initGhostty } from "@termless/ghostty"
import type { TerminalBackend } from "@termless/core"

const __dirname = dirname(fileURLToPath(import.meta.url))
const GOLDEN_VAULT = resolve(__dirname, "fixtures/golden-vault")
const haveVault = existsSync(GOLDEN_VAULT)

const COLS = 360
const ROWS = 120

interface RGB {
  r: number
  g: number
  b: number
}

let ghostty: Awaited<ReturnType<typeof initGhostty>>
beforeAll(async () => {
  ghostty = await initGhostty()
})

const active: TerminalBackend[] = []
afterEach(() => {
  for (const b of active) {
    try {
      b.destroy()
    } catch {
      /* ignore */
    }
  }
  active.length = 0
})

function spawn(create: () => TerminalBackend): TerminalBackend {
  const b = create()
  b.init({ cols: COLS, rows: ROWS })
  active.push(b)
  return b
}

function bgEq(a: RGB | null, b: RGB | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function fmtBg(bg: RGB | null): string {
  return bg ? `rgb(${bg.r},${bg.g},${bg.b})` : "null"
}

/** Strip-color predicate copied from render-light-blue-strip-residue.slow.spec.ts. */
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

describe.skipIf(!haveVault)("render: cyan-strip cross-backend (golden vault, 360x120)", () => {
  // Expected to fail while @km/silvery/render-light-blue-bg-strip-residue is open.
  // Keeping this executable preserves the byte/cell repro without making the
  // normal slow suite red until the rendering bug is fixed.
  test.fails("xterm and Ghostty agree on every cell's bg for the cold-start frame", async () => {
    // 1. Mount real board (parseDeferred so cards have real content, not skeletons).
    const board = await testBoard(GOLDEN_VAULT, { columns: COLS, rows: ROWS, parseDeferred: true })
    const buffer = board._result.lastBuffer()
    if (!buffer) throw new Error("[probe] testBoard produced no buffer — frame canary should have caught this")

    // 2. Emit canonical paint-from-scratch ANSI for the whole frame.
    //    Disable trimming so trailing bg paints survive (those are the suspect bytes).
    const ansi = bufferToStyledText(buffer, { trimTrailingWhitespace: false, trimEmptyLines: false })
    const bytes = new TextEncoder().encode(ansi)

    // 3. Sanity: silvery's own buffer should have zero strip-color cells anywhere
    //    above row 1 (header) — Round 4 confirmed this. Re-check here so a
    //    regression in the buffer surfaces as a different failure mode than the
    //    cross-backend divergence we're hunting.
    let silveryStripCells = 0
    for (let row = 2; row < buffer.height; row++) {
      for (let col = 0; col < buffer.width; col++) {
        const cell = buffer.getCell(col, row)
        const bg: unknown = cell.bg
        // FrameCell.bg can be string ("#xxxxxx"), null, or RGB-shaped — normalize.
        let rgb: RGB | null = null
        if (bg && typeof bg === "object" && "r" in bg) rgb = bg as RGB
        else if (typeof bg === "string" && bg.startsWith("#") && bg.length === 7) {
          rgb = { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16) }
        }
        if (isStripColor(rgb)) silveryStripCells++
      }
    }

    // 4. Feed the same bytes into both backends.
    const xt = spawn(() => createXtermBackend())
    const gt = spawn(() => createGhosttyBackend(undefined, ghostty))
    xt.feed(bytes)
    gt.feed(bytes)

    // 5. Cross-compare cell-by-cell. Record the first 30 divergences with byte
    //    context — we want enough to pattern-match against the user's screenshot
    //    (do they cluster at row boundaries? same column ranges as the cursor card?).
    interface Divergence {
      row: number
      col: number
      char: string
      xtBg: RGB | null
      gtBg: RGB | null
      lineByteWindow: string
    }
    const divergences: Divergence[] = []
    const stripDivergences: Divergence[] = []
    const lines = ansi.split("\n")

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const xc = xt.getCell(row, col)
        const gc = gt.getCell(row, col)
        if (bgEq(xc.bg, gc.bg)) continue

        // Capture a small ANSI byte window around (row, col) for context.
        // We don't have a reverse map cell→byte, so log the line + col index.
        const line = lines[row] ?? ""
        const start = Math.max(0, col * 2 - 30)
        const lineByteWindow = JSON.stringify(line.slice(start, start + 60))

        const div: Divergence = {
          row,
          col,
          char: xc.char || gc.char || " ",
          xtBg: xc.bg,
          gtBg: gc.bg,
          lineByteWindow,
        }
        if (divergences.length < 30) divergences.push(div)
        if (isStripColor(xc.bg) || isStripColor(gc.bg)) {
          if (stripDivergences.length < 30) stripDivergences.push(div)
        }
      }
    }

    // 6. Report.
    if (divergences.length > 0 || stripDivergences.length > 0) {
      const fmt = (label: string, list: Divergence[]) =>
        `[${label}] ${list.length} cells:\n` +
        list
          .slice(0, 12)
          .map(
            (d) =>
              `  row=${d.row} col=${d.col} char=${JSON.stringify(d.char)} ` +
              `xt.bg=${fmtBg(d.xtBg)} gt.bg=${fmtBg(d.gtBg)} ` +
              `line[${d.col}±30]=${d.lineByteWindow}`,
          )
          .join("\n")

      throw new Error(
        `Cross-backend bg divergence found (silvery buffer strip-cells above row 2: ${silveryStripCells}):\n` +
          fmt("ALL DIVERGENT CELLS (first 30)", divergences) +
          (stripDivergences.length > 0
            ? `\n\n${fmt("STRIP-COLOR DIVERGENCES (cyan/blue family — matches user's screenshot)", stripDivergences)}`
            : "\n\n[probe] no strip-color divergences — divergence is in some other bg family"),
      )
    }

    // Pass: both backends agreed on every cell's bg.
    expect(silveryStripCells).toBe(0)
  }, 240_000)
})

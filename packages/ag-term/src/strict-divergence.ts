/**
 * STRICT divergence — the blank-screen class-killer (19604 focus-blank).
 *
 * Bead: @km/code/v0.2/19604-focus-blank (#undead #P0).
 *
 * The 19604 signature is brutally specific: silvery emits a FULL content
 * frame (bytes_out shows a real frame — painted cells, ANSI, the works)
 * while the TERMINAL SCREEN IS BLANK (cmux `read-screen` reports
 * nonspace=0). The render pipeline and the emulator disagree: our buffer
 * says "thousands of cells painted", the screen says "all spaces". A
 * swallowed focus-restore repaint, a degenerate-resize heal that never
 * lands, a cursor-positioning desync that parks every write off-screen —
 * any of them produces this exact divergence, and ALL of them are silent
 * today (the frame "succeeds" from silvery's point of view).
 *
 * This check makes that class LOUD. After a frame's cumulative ANSI has
 * been fed into an in-process emulator (the SILVERY_STRICT_TERMINAL
 * readback path), compare:
 *
 *   painted := buffer.countPaintedCells()        (what we MEANT to draw)
 *   onScreen := emulator non-space cell count    (what the terminal SHOWS)
 *
 * If `painted` is a real content frame (>= CONTENT_THRESHOLD, not the
 * near-empty splash/spinner) but `onScreen === 0`, the frame is a 19604
 * blank-screen divergence — throw.
 *
 * ── Why this lives in ag-term/src/ and not pipeline/ ──
 * Like strict-cls.ts, this is a pure assertion helper. It consumes a
 * painted-cell count and an emulator readback and decides via the
 * SILVERY_STRICT contract. It has no coupling to render-phase /
 * layout-phase internals. The ONE call site (output-phase.ts, right
 * after `verifyTerminalEquivalence` feeds the frame into the emulator)
 * passes both numbers in — this module never reaches into the pipeline.
 *
 * ── Strictness: tier 2 (paranoid) ──
 * `SILVERY_STRICT=2` (or `=divergence`, or `=3`) fires the throw;
 * `SILVERY_STRICT=1` does NOT — it emits a `silvery:divergence` debug
 * line instead (mirrors the degenerate-frame canary's tier-2 throw-vs-
 * debug shape in renderer.ts). The default tier-1 `bun run test:fast`
 * pass stays green; only the paranoid tier asserts. `console.warn` is
 * deliberately NOT used — km's vitest setup treats any `console.warn`
 * as a hard test failure.
 *
 * ── No-op in production by construction ──
 * The check only has a meaningful emulator readback when an in-process
 * emulator exists, i.e. under `SILVERY_STRICT_TERMINAL=xterm|ghostty`.
 * Live Ghostty / a real TTY has NO in-process emulator — the call site
 * is inside the `tvState.terminal || tvState.ghosttyTerminal` block, so
 * production live terminals never enter it and can never throw. The
 * `emulatorReadback === null` guard is a second belt: a null readback is
 * a structural no-op regardless of tier.
 */

import { isStrictEnabled } from "./strict-mode"
import { createLogger } from "loggily"

const log = createLogger("silvery:divergence")

/** SILVERY_STRICT slug for the render/emulator divergence check. Tier 2 by design. */
export const DIVERGENCE_STRICT_SLUG = "divergence"
export const DIVERGENCE_STRICT_MIN_TIER = 2

/**
 * Minimum painted-cell count for the check to engage. Below this, the
 * buffer is a unit-test fixture or a legitimately near-empty frame
 * (startup splash, lone spinner, cleared screen) where "few painted
 * cells, zero on screen" is not a bug. Matches the degenerate-frame
 * canary's CANARY_MIN_BUFFER_CELLS spirit (≈80×50) — a real app frame
 * paints far more than this; a blank-but-content-frame divergence at
 * 19604 scale paints thousands.
 */
export const DIVERGENCE_MIN_PAINTED_CELLS = 4000

/** Returns true when SILVERY_STRICT=divergence (or =2 / =3 / etc.) is enabled. */
export function isDivergenceStrictEnabled(): boolean {
  return isStrictEnabled(DIVERGENCE_STRICT_SLUG, DIVERGENCE_STRICT_MIN_TIER)
}

/**
 * Thrown when a frame had real painted content in silvery's buffer but
 * the in-process emulator readback is all-spaces (zero non-space cells).
 * This is the 19604 blank-screen signature: a full frame emitted to a
 * blank screen.
 *
 * `.paintedCells` / `.onScreenCells` are exposed for programmatic
 * inspection; `.message` names 19604 and both counts.
 */
export class RenderEmulatorDivergenceError extends Error {
  readonly paintedCells: number
  readonly onScreenCells: number

  constructor(paintedCells: number, onScreenCells: number, backend: string, frameCount: number) {
    super(
      `[SILVERY_STRICT=divergence] render/emulator divergence (19604 blank-screen signature): ` +
        `frame ${frameCount} painted ${paintedCells} content cells but the ${backend} emulator ` +
        `readback is all-spaces (${onScreenCells} non-space cells). silvery emitted a full ` +
        `content frame while the terminal screen is blank — the exact @km/code/v0.2/19604-focus-blank ` +
        `failure mode (a swallowed/mis-positioned repaint that never lands on screen). ` +
        `Per-test opt-out: SILVERY_STRICT=2,!divergence.`,
    )
    this.name = "RenderEmulatorDivergenceError"
    this.paintedCells = paintedCells
    this.onScreenCells = onScreenCells
  }
}

/** Object with `countPaintedCells()` — structural so tests can pass a stub. */
export interface PaintedCellSource {
  countPaintedCells(): number
}

/**
 * The emulator readback for one in-process terminal backend.
 *
 * `nonSpaceCells` is the number of non-whitespace cells currently on the
 * emulator screen (e.g. `terminal.getText()` with whitespace stripped, or
 * a per-cell `char.trim() !== ""` count). `backendName` is for the error
 * message ("xterm" / "ghostty").
 */
export interface EmulatorReadback {
  nonSpaceCells: number
  backendName: string
}

/**
 * Throws `RenderEmulatorDivergenceError` if the frame painted a real
 * content buffer but the emulator readback shows an all-spaces screen,
 * AND `SILVERY_STRICT=divergence` (or a stricter tier) is enabled.
 * Otherwise a no-op.
 *
 * Gates (all must pass to engage):
 *   1. `isDivergenceStrictEnabled()` — slug/tier ≥ 2.
 *   2. `emulatorReadback !== null` — an in-process emulator exists
 *      (no-op for live TTYs, which have none).
 *   3. `buffer.countPaintedCells() >= DIVERGENCE_MIN_PAINTED_CELLS` —
 *      this is a real content frame, not a near-empty / unit-fixture one.
 *
 * Divergence condition: the gated content frame's emulator readback has
 * ZERO non-space cells.
 *
 * Tier handling mirrors the degenerate-frame canary: explicit slug
 * "divergence" or tier ≥ 2 throws; a lower tier that somehow reaches
 * here (it cannot via `isDivergenceStrictEnabled`, but the debug branch
 * is kept for parity / future tier-1 promotion) emits a debug line.
 *
 * @param buffer           painted-cell source (the just-rendered `next` buffer)
 * @param emulatorReadback the in-process emulator readback, or `null` when none exists
 * @param frameCount       frame index for the diagnostic message
 */
export function checkRenderEmulatorDivergence(
  buffer: PaintedCellSource,
  emulatorReadback: EmulatorReadback | null,
  frameCount: number = 0,
): void {
  // Gate 2: no in-process emulator → structural no-op (live TTY path).
  if (emulatorReadback === null) return
  // Gate 1 (cheap-after-2): only engage when the slug/tier is on. Checked
  // after the null guard so the production path short-circuits first.
  if (!isStrictEnabled(DIVERGENCE_STRICT_SLUG, 1)) return

  const painted = buffer.countPaintedCells()
  // Gate 3: real content frame only.
  if (painted < DIVERGENCE_MIN_PAINTED_CELLS) return

  // The divergence: real content painted, nothing on screen.
  if (emulatorReadback.nonSpaceCells !== 0) return

  if (isDivergenceStrictEnabled()) {
    throw new RenderEmulatorDivergenceError(
      painted,
      emulatorReadback.nonSpaceCells,
      emulatorReadback.backendName,
      frameCount,
    )
  } else {
    // Tier-1 (slug not at tier 2): observe, don't block. Parity with the
    // canary so a future tier-1 promotion is a one-line change.
    log.debug?.(
      `silvery: render/emulator divergence (19604) — frame ${frameCount} painted ${painted} ` +
        `cells, ${emulatorReadback.backendName} emulator shows 0 non-space cells. ` +
        `Raise to SILVERY_STRICT=2 (or =divergence) to make this throw.`,
    )
  }
}

/**
 * Count non-space cells in an emulator's full-screen text readback.
 *
 * Helper for the call site: termless `Terminal.getText()` returns the
 * entire screen as a newline-joined string; non-whitespace length is the
 * "is anything visible" signal that matches cmux `read-screen` nonspace.
 */
export function countNonSpaceInText(screenText: string): number {
  let n = 0
  for (const ch of screenText) {
    // Newlines separate rows in getText(); spaces are blank cells. Any
    // other code point is a visible glyph.
    if (ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t") n++
  }
  return n
}

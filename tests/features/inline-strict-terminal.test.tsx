/**
 * Inline mode under SILVERY_STRICT_TERMINAL — regression coverage for
 * verifyTerminalEquivalence (xterm/ghostty) and verifyAccumulatedOutput on
 * inline incremental renders.
 *
 * Inline mode previously skipped persistent-emulator verification with a
 * TODO comment in output-phase.ts: the persistent terminals couldn't accept
 * inline relative-cursor output (CUU/CUD/CR) because their cursor history
 * starts at (0,0) and the first inline output uses CR-relative positioning.
 *
 * The fix: re-diff prev → next in FULLSCREEN mode (absolute CUP) for
 * verification. The persistent emulators are initialized with a
 * fullscreen-mode rendering of the first inline buffer, and each subsequent
 * inline incremental frame computes a fullscreen-mode equivalent diff for
 * verification. This covers buffer-diff correctness (changesToAnsi,
 * SGR transitions, OSC 66, wide chars) at the same fidelity as fullscreen
 * mode without requiring inline cursor positioning to be in scope.
 *
 * What this test guards: the verification path runs end-to-end without
 * throwing on a realistic sequence of inline incremental edits, growths,
 * and shrinks. A regression that produces a buffer-diff mismatch (e.g.,
 * wrong bg in changesToAnsi) would be caught here.
 *
 * What this test does NOT cover: inline-specific cursor positioning bugs
 * (relative CUU/CUD math, scrollback promotion, useCursor placement). Those
 * are tested in inline-output.test.tsx and inline-bleed.test.tsx via the
 * dedicated VT screen simulator.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest"
import { createBuffer, type TerminalBuffer } from "@silvery/ag-term/buffer"
import { createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { preloadStrictTerminalBackends } from "@silvery/ag-term/strict-terminal-backends"

// SILVERY_STRICT_TERMINAL=xterm replays output through xterm.js synchronously;
// its @termless ESM-graph load (post wave-3, not createRequire) must be preloaded.
beforeAll(async () => {
  await preloadStrictTerminalBackends()
})

let origStrictTerminal: string | undefined
let origStrictAccumulate: string | undefined

beforeEach(() => {
  origStrictTerminal = process.env.SILVERY_STRICT_TERMINAL
  origStrictAccumulate = process.env.SILVERY_STRICT_ACCUMULATE
})

afterEach(() => {
  if (origStrictTerminal === undefined) delete process.env.SILVERY_STRICT_TERMINAL
  else process.env.SILVERY_STRICT_TERMINAL = origStrictTerminal
  if (origStrictAccumulate === undefined) delete process.env.SILVERY_STRICT_ACCUMULATE
  else process.env.SILVERY_STRICT_ACCUMULATE = origStrictAccumulate
})

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let i = 0; i < text.length && i < buffer.width; i++) {
    buffer.setCell(i, row, { char: text[i]! })
  }
}

function bufferWithLines(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = createBuffer(width, height)
  for (let i = 0; i < lines.length; i++) writeLine(buf, i, lines[i]!)
  return buf
}

describe("inline mode under SILVERY_STRICT_TERMINAL=xterm", () => {
  test("simple incremental edit passes verification", () => {
    process.env.SILVERY_STRICT_TERMINAL = "xterm"

    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})

    // Initial render: tvState gets initialized with fullscreen output
    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C"])
    expect(() => op(null, buf1, "inline", 0, ROWS)).not.toThrow()

    // Incremental render: changesToAnsi diff is verified through xterm
    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "CHANGED", "Line C"])
    expect(() => op(buf1, buf2, "inline", 0, ROWS)).not.toThrow()

    // Another incremental
    const buf3 = bufferWithLines(COLS, ROWS, ["Line A", "CHANGED", "MODIFIED"])
    expect(() => op(buf2, buf3, "inline", 0, ROWS)).not.toThrow()
  })

  test("content growth across multiple frames passes verification", () => {
    process.env.SILVERY_STRICT_TERMINAL = "xterm"

    const COLS = 40,
      ROWS = 15
    const op = createOutputPhase({})

    const buf1 = bufferWithLines(COLS, ROWS, ["Line A"])
    expect(() => op(null, buf1, "inline", 0, ROWS)).not.toThrow()

    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "Line B"])
    expect(() => op(buf1, buf2, "inline", 0, ROWS)).not.toThrow()

    const buf3 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D"])
    expect(() => op(buf2, buf3, "inline", 0, ROWS)).not.toThrow()
  })

  test("content shrinking across multiple frames passes verification", () => {
    process.env.SILVERY_STRICT_TERMINAL = "xterm"

    const COLS = 40,
      ROWS = 15
    const op = createOutputPhase({})

    const buf1 = bufferWithLines(COLS, ROWS, ["Line A", "Line B", "Line C", "Line D", "Line E"])
    expect(() => op(null, buf1, "inline", 0, ROWS)).not.toThrow()

    const buf2 = bufferWithLines(COLS, ROWS, ["Line A", "Line B"])
    expect(() => op(buf1, buf2, "inline", 0, ROWS)).not.toThrow()

    const buf3 = bufferWithLines(COLS, ROWS, ["X"])
    expect(() => op(buf2, buf3, "inline", 0, ROWS)).not.toThrow()
  })

  test("mixed growth and shrinkage sequence passes verification", () => {
    process.env.SILVERY_STRICT_TERMINAL = "xterm"

    const COLS = 30,
      ROWS = 12
    const op = createOutputPhase({})

    const buf1 = bufferWithLines(COLS, ROWS, ["start"])
    expect(() => op(null, buf1, "inline", 0, ROWS)).not.toThrow()

    const buf2 = bufferWithLines(COLS, ROWS, ["start", "alpha", "beta"])
    expect(() => op(buf1, buf2, "inline", 0, ROWS)).not.toThrow()

    const buf3 = bufferWithLines(COLS, ROWS, ["start", "alpha"])
    expect(() => op(buf2, buf3, "inline", 0, ROWS)).not.toThrow()

    const buf4 = bufferWithLines(COLS, ROWS, ["start", "alpha", "gamma", "delta", "epsilon"])
    expect(() => op(buf3, buf4, "inline", 0, ROWS)).not.toThrow()

    const buf5 = bufferWithLines(COLS, ROWS, ["end"])
    expect(() => op(buf4, buf5, "inline", 0, ROWS)).not.toThrow()
  })

  test("STRICT_ACCUMULATE on inline mode passes verification", () => {
    process.env.SILVERY_STRICT_ACCUMULATE = "1"

    const COLS = 40,
      ROWS = 10
    const op = createOutputPhase({})

    const buf1 = bufferWithLines(COLS, ROWS, ["A", "B", "C"])
    expect(() => op(null, buf1, "inline", 0, ROWS)).not.toThrow()

    const buf2 = bufferWithLines(COLS, ROWS, ["A2", "B", "C"])
    expect(() => op(buf1, buf2, "inline", 0, ROWS)).not.toThrow()

    const buf3 = bufferWithLines(COLS, ROWS, ["A2", "B2", "C2"])
    expect(() => op(buf2, buf3, "inline", 0, ROWS)).not.toThrow()

    const buf4 = bufferWithLines(COLS, ROWS, ["A2", "B2", "C2", "D"])
    expect(() => op(buf3, buf4, "inline", 0, ROWS)).not.toThrow()
  })

  test("scrollbackOffset > 0 falls back to full render and re-aligns verification", () => {
    process.env.SILVERY_STRICT_TERMINAL = "xterm"

    const COLS = 30,
      ROWS = 10
    const op = createOutputPhase({})

    const buf1 = bufferWithLines(COLS, ROWS, ["A", "B", "C"])
    expect(() => op(null, buf1, "inline", 0, ROWS)).not.toThrow()

    // External writes between renders → scrollbackOffset > 0 forces inlineFullRender,
    // which must re-init the persistent terminal verification state.
    const buf2 = bufferWithLines(COLS, ROWS, ["A", "B", "C", "D"])
    expect(() => op(buf1, buf2, "inline", 2, ROWS)).not.toThrow()

    // Subsequent incremental should still pass after the realignment.
    const buf3 = bufferWithLines(COLS, ROWS, ["A", "B2", "C", "D"])
    expect(() => op(buf2, buf3, "inline", 0, ROWS)).not.toThrow()
  })
})

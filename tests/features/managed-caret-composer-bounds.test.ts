/**
 * @km/code/v0.2/19702 (#undead) — composited-caret-in-composer-bounds invariant.
 *
 * The existing `assertCursorMatches` (cursor-diagnostics.ts) only validates the
 * HARDWARE cursor parking/visibility. It says NOTHING about where the VISIBLE
 * COMPOSITED caret (the `inverse` cell `composeManagedCaret` paints) actually
 * landed. The 19702 signature is exactly that gap: a Silvery-owned composited
 * caret stranded several rows ABOVE the composer, on a transcript/chrome row —
 * a frame that passes every hardware-cursor assertion while the live pane is RED.
 *
 * This pins the missing diagnostic invariant: when a managed frame composites a
 * VISIBLE caret AND the editable's content rect (`composerBounds`) is known, the
 * caret cell MUST fall inside that rect (rows are half-open [y, y+height); the
 * end-of-line column may sit one past the content width). A caret outside its
 * composer's bounds is the stranded-caret artifact — recorded as
 * `compositorCaretInComposerBounds === false` and surfaced as a loud
 * `silvery:cursor` warning.
 *
 * It is recorded (not thrown) because a `cursorActive` island composites a caret
 * OUTSIDE the (separate) composer's bounds legitimately, and the diagnostics
 * payload does not yet carry the caret's owning-node rect to disambiguate. Once
 * the provenance walk folds `findActiveCursorNode` into a `{node, rect,
 * provenance}` result (the noted 19702 follow-up), this can become a hard throw
 * scoped to `focused-declarative` provenance.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  clearLastOutputCursorDiagnostics,
  getLastOutputCursorDiagnostics,
  recordOutputCursorDiagnostics,
} from "../../packages/ag-term/src/cursor-diagnostics"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"

const originalStrict = process.env.SILVERY_STRICT

// loggily routes log.warn → console.warn; the out-of-bounds invariant is SUPPOSED
// to warn loudly (NO SILENT ERRORS). Absorb it here and assert it fired, instead
// of letting km-infra's console-output ban (vitest setup) treat the loud signal
// as a test failure.
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
  resetStrictCache()
  clearLastOutputCursorDiagnostics()
})

/** Did the 19702 stranded-caret warning fire this test? */
function warned19702(): boolean {
  return warnSpy.mock.calls.some((args) => args.some((a) => String(a).includes("19702")))
}

function enableCursorStrict(): void {
  process.env.SILVERY_STRICT = "cursor"
  resetStrictCache()
}

/**
 * A minimal hidden-hardware-cursor fullscreen frame: the composited caret is
 * painted into the buffer, the hardware cursor is parked + hidden. We only need
 * the recorded diagnostics, so the `output` is a bare park+hide at the caret.
 */
function recordFrame(opts: {
  caret: { x: number; y: number } | null
  composerBounds: { x: number; y: number; width: number; height: number } | null
}): void {
  const caret = opts.caret
  const target = caret ? { x: caret.x, y: caret.y, visible: true } : null
  // Park the hardware cursor at the caret (or home) then hide — a well-formed
  // managed frame so the hardware-cursor assertion stays satisfied and only the
  // new composited-caret-bounds invariant is under test.
  const park = caret ?? { x: 0, y: 0 }
  const output = `\x1b[${park.y + 1};${park.x + 1}H\x1b[?25l`
  recordOutputCursorDiagnostics({
    reason: "test-composer-bounds",
    mode: "fullscreen",
    width: 80,
    height: 40,
    output,
    target,
    expectedTerminal: target ? { ...target, visible: false } : null,
    compositorCaret: caret ? { x: caret.x, y: caret.y, visible: true, style: "block" } : null,
    composerBounds: opts.composerBounds,
  })
}

describe("19702 (#undead) — composited caret must sit inside the composer bounds", () => {
  test("caret stranded ABOVE the composer is flagged out-of-bounds", () => {
    enableCursorStrict()
    // Composer occupies rows 30..30 (height 1) at cols 2..58; caret stranded on
    // a transcript row four rows above it — the live 19702 geometry.
    recordFrame({
      caret: { x: 5, y: 26 },
      composerBounds: { x: 2, y: 30, width: 56, height: 1 },
    })
    const d = getLastOutputCursorDiagnostics()
    expect(
      d?.compositorCaretInComposerBounds,
      `stranded caret (above composer) must be flagged out-of-bounds\n${JSON.stringify(d, null, 2)}`,
    ).toBe(false)
    expect(warned19702(), "stranded caret must warn loudly (NO SILENT ERRORS)").toBe(true)
  })

  test("caret BELOW the composer is flagged out-of-bounds", () => {
    enableCursorStrict()
    recordFrame({
      caret: { x: 5, y: 33 },
      composerBounds: { x: 2, y: 30, width: 56, height: 1 },
    })
    expect(getLastOutputCursorDiagnostics()?.compositorCaretInComposerBounds).toBe(false)
    expect(warned19702()).toBe(true)
  })

  test("caret inside the composer content rect is in-bounds", () => {
    enableCursorStrict()
    recordFrame({
      caret: { x: 4, y: 30 },
      composerBounds: { x: 2, y: 30, width: 56, height: 1 },
    })
    expect(getLastOutputCursorDiagnostics()?.compositorCaretInComposerBounds).toBe(true)
    expect(warned19702(), "an in-bounds caret must NOT warn").toBe(false)
  })

  test("caret at the end-of-line virtual column (x === bounds.x + width) is in-bounds", () => {
    enableCursorStrict()
    // A caret one past the last content column is where the next char would be
    // typed — a legitimate position, not a stranded artifact.
    recordFrame({
      caret: { x: 58, y: 30 },
      composerBounds: { x: 2, y: 30, width: 56, height: 1 },
    })
    expect(getLastOutputCursorDiagnostics()?.compositorCaretInComposerBounds).toBe(true)
    expect(warned19702()).toBe(false)
  })

  test("multi-line composer: caret on an inner content row is in-bounds", () => {
    enableCursorStrict()
    recordFrame({
      caret: { x: 6, y: 32 },
      composerBounds: { x: 2, y: 30, width: 56, height: 4 },
    })
    expect(getLastOutputCursorDiagnostics()?.compositorCaretInComposerBounds).toBe(true)
    expect(warned19702()).toBe(false)
  })

  test("not checkable when no composited caret (null)", () => {
    enableCursorStrict()
    recordFrame({ caret: null, composerBounds: { x: 2, y: 30, width: 56, height: 1 } })
    expect(getLastOutputCursorDiagnostics()?.compositorCaretInComposerBounds).toBeNull()
    expect(warned19702()).toBe(false)
  })

  test("not checkable when composer bounds are unknown (island / legacy cursor)", () => {
    enableCursorStrict()
    recordFrame({ caret: { x: 5, y: 26 }, composerBounds: null })
    expect(getLastOutputCursorDiagnostics()?.compositorCaretInComposerBounds).toBeNull()
    expect(warned19702()).toBe(false)
  })
})

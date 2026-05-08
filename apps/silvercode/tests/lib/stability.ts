/**
 * Stability invariants — shared assertions for "the UI converges within K
 * paint passes after a stability event."
 *
 * Used by `welcome-stability.test.tsx` and `chat-stability.test.tsx`. Bead:
 * `@km/silvercode/post-resize-ui-stability`.
 *
 * The invariants come in two shapes that share the same assertion engine:
 *
 *   - **Component frames** (via `render({ onFrame })` from `@silvery/test`)
 *     — every committed React frame is captured. Use `recordRenderFrames()`
 *     to get a reusable collector.
 *
 *   - **Termless polled frames** (via `createTermless()` + run() + sampling)
 *     — the emulator screen is polled at a short interval; only distinct
 *     fingerprints are kept. Use `pollTermlessFrames()`.
 *
 * Both harnesses produce a list of layout fingerprints; both feed into
 * `expectStableLayouts(fingerprints, { label, kMax })`.
 */

import type { TerminalBuffer } from "@silvery/ag-term/buffer"
import { bufferToText } from "@silvery/test"

/**
 * Normalize a frame for layout comparison: strip trailing whitespace per
 * line and drop trailing empty lines. Compare on plain text (ANSI-stripped)
 * so colour drift between paints is not counted as a layout change — only
 * character positions are.
 *
 * Same algorithm as `welcome-startup-cascade.test.tsx`. Lifted here for
 * reuse across the stability suite.
 */
export function layoutFingerprint(text: string | undefined | null): string {
  if (typeof text !== "string") return ""
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "")
}

function hasContent(frame: string): boolean {
  return frame.replace(/[\s\u00a0]+/gu, "").length > 0
}

/** Strip blank-content frames so we compare only content-bearing layouts. */
export function dropBlankFrames(fingerprints: readonly string[]): string[] {
  return fingerprints.filter(hasContent)
}

export interface StabilityAssertionOptions {
  /** Human label that appears in failure messages. */
  label: string
  /**
   * Maximum distinct content-bearing fingerprints allowed in the captured
   * window. Default 2 — matches the canonical "≤ 1 transient + 1 stable"
   * budget.
   *
   * Initial-paint cells frequently allow 2 (one useBoxRect-driven first
   * commit, one settled). Resize and toggle cells often want 1 (steady →
   * one new steady, no transients).
   */
  kMax?: number
  /**
   * Optional check: any frame violating this predicate fails the test.
   * Returns `null` if frame is fine, else a reason string. Useful for
   * "every frame must contain the banner" / "no frame is empty".
   */
  expectNotDegenerate?: (frame: string) => string | null
}

/* ------------------------------------------------------------------ */
/* Component-level (render({ onFrame })) collector                    */
/* ------------------------------------------------------------------ */

export interface RecordedRenderFrames {
  /** Hook into `render({ onFrame })` from `@silvery/test`. */
  onFrame: (frame: string, buffer: TerminalBuffer) => void
  /** Raw plain-text snapshots, in commit order. Mutated as frames arrive. */
  raw: string[]
  /**
   * Distinct content-bearing layout fingerprints in commit order
   * (consecutive duplicates collapsed).
   */
  fingerprints(): string[]
  /** Drop everything captured so far. Use BEFORE driving an event. */
  reset(): void
}

/**
 * Build a frame-collector for the component-level renderer.
 *
 * @example
 *   const rec = recordRenderFrames()
 *   const app = render(<Tree/>, { cols, rows, onFrame: rec.onFrame })
 *   await settle()
 *   rec.reset()           // Drop pre-event frames
 *   driveEvent()
 *   await settle()
 *   expectStableLayouts(rec.fingerprints(), { label: "resize", kMax: 2 })
 */
export function recordRenderFrames(): RecordedRenderFrames {
  const raw: string[] = []
  return {
    raw,
    onFrame(_frame: string, buffer: TerminalBuffer) {
      raw.push(bufferToText(buffer))
    },
    fingerprints() {
      const out: string[] = []
      for (const r of raw) {
        const fp = layoutFingerprint(r)
        if (!hasContent(fp)) continue
        if (out.length > 0 && out[out.length - 1] === fp) continue
        out.push(fp)
      }
      return out
    },
    reset() {
      raw.length = 0
    },
  }
}

export function firstVisibleContentSignature(text: string | undefined | null): string | null {
  const frame = layoutFingerprint(text)
  if (!frame) return null
  const lines = frame.split("\n")
  const row = lines.findIndex((line) => line.trim().length > 0)
  if (row < 0) return null
  return `${row}:${lines[row]!.trim()}`
}

export function distinctFirstVisibleContentSignatures(frames: readonly string[]): string[] {
  const out: string[] = []
  for (const frame of frames) {
    const signature = firstVisibleContentSignature(frame)
    if (signature === null) continue
    if (out.at(-1) !== signature) out.push(signature)
  }
  return out
}

export function expectStableFirstVisibleContent(frames: readonly string[], opts: { label: string }): void {
  const signatures = distinctFirstVisibleContentSignatures(frames)
  if (signatures.length === 0) {
    throw new Error(`[${opts.label}] no first visible content row captured — harness wiring bug`)
  }
  const distinct = [...new Set(signatures)]
  if (distinct.length > 1) {
    const summary = distinct.map((signature, index) => `  ${index + 1}. ${signature}`).join("\n")
    throw new Error(
      `[${opts.label}] first visible content row changed across captured frames.\n\n` +
        `Distinct first-row signatures:\n${summary}\n\n` +
        `First frame preview:\n${preview(frames[0] ?? "")}\n\n` +
        `Last frame preview:\n${preview(frames.at(-1) ?? "")}`,
    )
  }
}

/* ------------------------------------------------------------------ */
/* Termless polled collector                                          */
/* ------------------------------------------------------------------ */

interface TermlessScreenLike {
  screen: { text?: string; getText?: () => string } | null
}

function readTermlessText(term: TermlessScreenLike): string {
  const screen = term.screen
  return screen ? (typeof screen.getText === "function" ? screen.getText() : (screen.text ?? "")) : ""
}

export async function waitForStableTermlessFrame(
  term: TermlessScreenLike,
  opts: { label: string; timeoutMs: number; quietMs: number; intervalMs?: number },
): Promise<string> {
  const interval = opts.intervalMs ?? 10
  const timeoutAt = Date.now() + opts.timeoutMs
  let last = ""
  let lastChangedAt = Date.now()
  const observed: string[] = []

  while (Date.now() < timeoutAt) {
    let fp = ""
    try {
      fp = layoutFingerprint(readTermlessText(term))
    } catch {
      fp = ""
    }
    if (fp && fp !== last) {
      last = fp
      lastChangedAt = Date.now()
      if (observed.at(-1) !== fp) observed.push(fp)
    }
    if (last && Date.now() - lastChangedAt >= opts.quietMs) return last
    await new Promise((r) => setTimeout(r, interval))
  }

  const summary = observed
    .slice(-4)
    .map((fp, i) => `--- observed layout ${i + 1} ---\n${preview(fp)}`)
    .join("\n\n")
  throw new Error(
    `[${opts.label}] layout did not remain unchanged for ${opts.quietMs}ms within ${opts.timeoutMs}ms.\n\n${summary}`,
  )
}

/**
 * Poll an emulator-backed terminal's screen for the duration window,
 * keeping each distinct content-bearing fingerprint observed.
 *
 * Same loop as `welcome-startup-cascade.test.tsx` — extracted for reuse.
 *
 * @param term      A `createTermless()` Term (or anything with a `screen`).
 * @param duration  Total polling window in milliseconds.
 * @param interval  Polling interval; default 5 ms.
 */
export async function pollTermlessFrames(
  term: TermlessScreenLike,
  opts: { durationMs: number; intervalMs?: number },
): Promise<string[]> {
  const interval = opts.intervalMs ?? 5
  const out: string[] = []
  let last = ""
  const stop = Date.now() + opts.durationMs
  while (Date.now() < stop) {
    let fp = ""
    try {
      fp = layoutFingerprint(readTermlessText(term))
    } catch {
      // Swallow polling errors during teardown / async transitions.
    }
    if (fp && fp !== last) {
      last = fp
      out.push(fp)
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Assertion                                                          */
/* ------------------------------------------------------------------ */

/**
 * Assert that the captured frame stream represents a stable layout: at
 * most `kMax` distinct content-bearing fingerprints, no degenerate frames,
 * and at least one content-bearing frame.
 *
 * On failure the error message includes the first 8 lines of every distinct
 * layout, so the diff explains the shuffle directly.
 */
export function expectStableLayouts(fingerprints: readonly string[], opts: StabilityAssertionOptions): void {
  const { label, kMax = 2, expectNotDegenerate } = opts
  const content = dropBlankFrames(fingerprints)
  if (content.length === 0) {
    throw new Error(`[${label}] no content-bearing frames captured — harness wiring bug`)
  }
  if (expectNotDegenerate) {
    for (let i = 0; i < content.length; i++) {
      const reason = expectNotDegenerate(content[i]!)
      if (reason) {
        throw new Error(
          `[${label}] frame ${i} is degenerate: ${reason}\n\n--- frame ${i} (first 8 lines) ---\n${preview(
            content[i]!,
          )}`,
        )
      }
    }
  }
  const distinct = Array.from(new Set(content))
  if (distinct.length > kMax) {
    const summary = distinct
      .map((fp, i) => {
        const occurrences = content.filter((x) => x === fp).length
        return `--- layout #${i + 1} (${occurrences} frame${occurrences === 1 ? "" : "s"}) ---\n${preview(fp)}`
      })
      .join("\n\n")
    throw new Error(
      `[${label}] expected ≤ ${kMax} distinct stable layouts, observed ${distinct.length}.\n\n` +
        `Total content samples: ${content.length}.\n\n` +
        `Distinct layouts (first 8 lines each):\n\n${summary}`,
    )
  }
}

function preview(fp: string): string {
  return fp
    .split("\n")
    .slice(0, 8)
    .map((line) => `    ${line}`)
    .join("\n")
}

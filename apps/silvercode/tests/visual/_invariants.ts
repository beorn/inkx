/**
 * Layout invariants — universal visual assertions via the semantic
 * FrameParser. Each invariant answers "is this class of bug present?"
 * without hardcoding row numbers or component-specific insets.
 *
 * Call `expectLayoutInvariants(s)` at the end of every visual-scenario
 * test body. Each invariant has an opt-out flag for the rare case where
 * a scenario legitimately violates it (e.g. Welcome panel has no card
 * stream so icon-align doesn't apply).
 *
 * The invariants use `parseFrame()` from `src/test/parse-frame.ts` — when
 * a component's marker text changes, update parse-frame.ts once, not every
 * invariant.
 */

import { expect } from "vitest"
import type { RenderedScenario } from "../../src/test/render-harness.tsx"
import { leftWidthFor } from "../../src/test/render-harness.tsx"
import {
  MODE_ICONS_EXPECTED,
  MODE_LABELS_EXPECTED,
  parseFrame,
  summarize,
  type ParsedFrame,
} from "../../src/test/parse-frame.ts"

// ----------------------------------------------------------------------------
// Invariant: no overflow into the side panel.
//
// The left region has overflow="hidden" — content past (cols - SIDE_WIDTH)
// should be clipped. The side panel occupies the right region with its
// own distinctive content. If we find arbitrary content in the right
// region that ISN'T side-panel material, it leaked through the overflow
// boundary.
//
// Heuristic: the right region MUST either be blank or contain at least
// one side-panel marker string.
// ----------------------------------------------------------------------------

/**
 * Detect overflow: a wrapped word that crosses the `leftWidth` boundary
 * WITHOUT a whitespace gap. The real failure mode is text flowing
 * continuously from the card region into the side-panel column zone —
 * "paragraph wraps into the side panel." We detect that by scanning
 * each line for a non-space run that spans [leftWidth - 1, leftWidth + 1]
 * AND whose continuation on the right side isn't clearly side-panel
 * material.
 *
 * Legitimate layout (no overflow):
 *   `   ● Hi!                                                       Sessions ...`
 *           ^left content ends                                      ^side panel starts
 *
 * Overflow (caught):
 *   `   ● Hello world this is a very long paragraph that bleeds right into the sidepanel`
 *                                                                  ^no gap around col 80
 *
 * This is the test for bug-class "paragraph wraps into side panel."
 */
export function assertNoOverflowIntoSidePanel(s: RenderedScenario, opts: { leftWidth?: number } = {}): void {
  const leftWidth = opts.leftWidth ?? leftWidthFor(s.cols)
  const offenders: Array<{ line: number; text: string; bleedFrom: number }> = []
  for (let i = 0; i < s.lines.length; i++) {
    const raw = s.lines[i] ?? ""
    if (raw.length <= leftWidth) continue
    const line = raw.padEnd(s.cols, " ")
    // Check a narrow window around the boundary: cols [leftWidth - 2,
    // leftWidth + 2]. If EVERY cell in that window is non-space, we have
    // text flowing continuously across the boundary — that's overflow.
    const lo = Math.max(0, leftWidth - 2)
    const hi = Math.min(s.cols, leftWidth + 2)
    const window = line.slice(lo, hi)
    const continuous = window.length > 0 && !/\s/.test(window)
    if (!continuous) continue
    // Find where the continuous non-space run starts by walking left
    // from leftWidth. That's the bleed origin.
    let bleedFrom = leftWidth
    while (bleedFrom > 0 && line[bleedFrom - 1] !== " ") bleedFrom--
    offenders.push({ line: i, text: raw, bleedFrom })
  }
  expect(
    offenders,
    `card-region text overflowed into the side panel column zone across leftWidth=${leftWidth}. ` +
      `${offenders.length} line(s) have non-space text spanning [${leftWidth - 2}..${leftWidth + 2}]:\n` +
      offenders
        .slice(0, 5)
        .map((o) => `  line ${o.line}, bleed starts col ${o.bleedFrom}: ${JSON.stringify(o.text)}`)
        .join("\n"),
  ).toHaveLength(0)
}

// ----------------------------------------------------------------------------
// Invariant: side panel is visible.
//
// At least one side-panel heading must render in the right region.
// ----------------------------------------------------------------------------

export function assertSidePanelVisible(s: RenderedScenario, opts: { leftWidth?: number } = {}): void {
  const leftWidth = opts.leftWidth ?? leftWidthFor(s.cols)
  const p = parseFrame(s, { leftWidth })
  expect(
    p.sidePanel,
    `side panel not found in the right region [>=${leftWidth}]. Frame summary:\n${summarize(p)}`,
  ).not.toBeNull()
  expect(p.sidePanel!.sessionsHeadingRow, `Sessions heading missing from side panel`).toBeGreaterThanOrEqual(0)
}

// ----------------------------------------------------------------------------
// Invariant: message-stream icon family alignment.
//
// The "flush" family (●, >, ◈) all use the card-stream's paddingX={1}
// inset and MUST appear at the same column. Tool call (⚙) has its own
// block frame (border stripe + inner padding) and sits in a different
// alignment family — excluded by default. Drift in the flush family
// means AssistantBlock / UserMessageBlock / ActivityIndicator went out of
// sync on paddingX.
// ----------------------------------------------------------------------------

export function assertIconFamilyAligned(s: RenderedScenario, opts: { leftWidth?: number } = {}): void {
  const p = parseFrame(s, { leftWidth: opts.leftWidth })
  const flush = p.cardStream.filter((b) => b.glyph === "●" || b.glyph === ">" || b.glyph === "◈")
  if (flush.length < 2) return
  const columns = [...new Set(flush.map((b) => b.glyphCol))]
  if (columns.length === 1) return
  const byCol = new Map<number, typeof flush>()
  for (const b of flush) {
    const bucket = byCol.get(b.glyphCol) ?? []
    bucket.push(b)
    byCol.set(b.glyphCol, bucket)
  }
  const summary = [...byCol.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([col, bs]) => `  col ${col}: ${bs.map((b) => `${b.glyph}@row${b.row}`).join(", ")}`)
    .join("\n")
  expect.fail(
    `flush-family icons (● > ◈) misaligned across rows — they should all share one column:\n${summary}\n\n${summarize(p)}`,
  )
}

// ----------------------------------------------------------------------------
// Invariant: mode row is well-formed.
//
// The side panel's mode line must contain the expected icon AND the
// expected full label for the current `mode` — same row, icon to the
// left of the label. Catches: wrong glyph, missing label, icon-only row,
// mode-specific typos.
// ----------------------------------------------------------------------------

export function assertModeRowWellFormed(s: RenderedScenario, mode: keyof typeof MODE_LABELS_EXPECTED): void {
  const p = parseFrame(s)
  expect(p.sidePanel, `cannot assert mode row — side panel not found`).not.toBeNull()
  const row = p.sidePanel!.modeRow
  expect(row, `mode row not found for mode="${mode}". ${summarize(p)}`).not.toBeNull()
  expect(row!.label, `mode label mismatch for mode="${mode}"`).toBe(MODE_LABELS_EXPECTED[mode])
  expect(row!.icon, `mode icon mismatch for mode="${mode}"`).toBe(MODE_ICONS_EXPECTED[mode])
}

// ----------------------------------------------------------------------------
// Invariant: command input is present.
//
// The bottom chrome should always show the prompt `>`. Catches regressions
// where the command box disappears or the prompt glyph changes.
// ----------------------------------------------------------------------------

export function assertCommandInputPresent(s: RenderedScenario): void {
  const p = parseFrame(s)
  expect(p.inputBox.present, `command input prompt (>) not found.\n${summarize(p)}`).toBe(true)
}

// ----------------------------------------------------------------------------
// Composite: expectLayoutInvariants — run the universal set.
// ----------------------------------------------------------------------------

export type InvariantOptions = {
  leftWidth?: number
  skip?: {
    overflow?: boolean
    icons?: boolean
    sidePanel?: boolean
    commandInput?: boolean
  }
}

export function expectLayoutInvariants(s: RenderedScenario, opts: InvariantOptions = {}): void {
  const leftWidth = opts.leftWidth ?? leftWidthFor(s.cols)
  const skip = opts.skip ?? {}
  if (!skip.overflow) assertNoOverflowIntoSidePanel(s, { leftWidth })
  if (!skip.sidePanel) assertSidePanelVisible(s, { leftWidth })
  if (!skip.icons) assertIconFamilyAligned(s, { leftWidth })
  if (!skip.commandInput) assertCommandInputPresent(s)
}

// Re-exports so test files get parseFrame + summaries from one place.
export { parseFrame, summarize, MODE_ICONS_EXPECTED, MODE_LABELS_EXPECTED, type ParsedFrame }

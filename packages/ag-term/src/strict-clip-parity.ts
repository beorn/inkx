/**
 * STRICT clip-parity - assert Text background overlays only paint cells
 * that the matching text render painted under the same clip bounds.
 *
 * Bead: @si/render/14332-clip-parity.
 *
 * The failure class: inline Text background segments are applied after
 * character rendering. If the bg pass clips differently than
 * renderGraphemes, it can leave colored empty cells past an
 * overflow-hidden parent while the corresponding characters were clipped.
 */

import { isStrictEnabled } from "./strict-mode.js"

/** SILVERY_STRICT slug for the bg/text clip parity check. Tier 2 by design. */
export const CLIP_PARITY_SLUG = "clip-parity"
export const CLIP_PARITY_MIN_TIER = 2

/** Returns true when the clip-parity check should fire. */
export function isClipParityEnabled(): boolean {
  return isStrictEnabled(CLIP_PARITY_SLUG, CLIP_PARITY_MIN_TIER)
}

export class ClipParityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ClipParityError"
  }
}

export interface AssertBgCellHasTextPaintOptions {
  x: number
  y: number
  textPaintColumns: ReadonlySet<number>
  leftClip: number
  rightClip: number
  bg?: unknown
  lineTextPreview?: string
}

/**
 * Assert that a bg overlay cell has a matching text-paint cell.
 *
 * Call this at the bg-overlay emission site, not after rendering. That keeps
 * the detector tied to the operation that can regress while the expected
 * columns are derived independently from renderGraphemes' clipping rules.
 */
export function assertBgCellHasTextPaint(opts: AssertBgCellHasTextPaintOptions): void {
  if (!isClipParityEnabled()) return
  if (opts.textPaintColumns.has(opts.x)) return

  const msg =
    `STRICT clip-parity: bg segment painted a cell without matching text paint\n` +
    `  cell:        (x=${opts.x}, y=${opts.y}) bg=${formatColor(opts.bg)}\n` +
    `  clip:        [left=${opts.leftClip}, right=${opts.rightClip})\n` +
    `  text columns: ${formatColumns(opts.textPaintColumns)}\n` +
    `  line:        ${JSON.stringify(opts.lineTextPreview ?? "")}\n` +
    `\n` +
    `  Background segments from nested <Text backgroundColor=...> must use\n` +
    `  the same visible clip as renderGraphemes. A bg-only cell here usually\n` +
    `  means applyBgSegmentsToLine is painting beyond minCol/maxCol.\n` +
    `\n` +
    `  Slug: SILVERY_STRICT=${CLIP_PARITY_SLUG} (tier ${CLIP_PARITY_MIN_TIER}+).\n` +
    `  Per-test opt-out: SILVERY_STRICT=2,!${CLIP_PARITY_SLUG}.`
  throw new ClipParityError(msg)
}

function formatColumns(columns: ReadonlySet<number>): string {
  const sorted = [...columns].sort((a, b) => a - b)
  if (sorted.length === 0) return "(none)"
  if (sorted.length <= 12) return sorted.join(",")
  return `${sorted.slice(0, 12).join(",")},... (${sorted.length} total)`
}

function formatColor(c: unknown): string {
  if (c === null || c === undefined) return "default"
  if (typeof c === "string") return c
  if (typeof c === "number") return `${c}`
  if (typeof c === "object") {
    const o = c as { r: number; g: number; b: number }
    if (typeof o.r === "number") {
      const hex = ((o.r << 16) | (o.g << 8) | o.b).toString(16).padStart(6, "0")
      return `#${hex}`
    }
  }
  return String(c)
}

/**
 * Content-width density — a coarse two-step responsive scale for a content
 * column measured in cells.
 *
 * Where {@link useResponsiveBoxProps} resolves a full breakpoint cascade
 * (xs…xl), some layouts only need a single "is this narrow enough to drop
 * non-essential chrome" decision. `densityForWidth` maps a content width to one
 * of two steps: `compact` at or below the breakpoint, `spacious` above it.
 */

export type Density = "spacious" | "compact"

/**
 * Default compact breakpoint (cells): a content column this wide or narrower
 * reads as `compact`. Override per call when a surface has its own threshold.
 */
export const DEFAULT_COMPACT_MAX_WIDTH = 29

/**
 * Map a content width (cells) to a {@link Density} step. A non-finite or
 * non-positive width resolves to `spacious` — the roomier default to fall back
 * on before a real measurement has arrived.
 */
export function densityForWidth(
  width: number,
  compactMaxWidth: number = DEFAULT_COMPACT_MAX_WIDTH,
): Density {
  if (!Number.isFinite(width) || width <= 0) return "spacious"
  return width <= compactMaxWidth ? "compact" : "spacious"
}

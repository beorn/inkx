/**
 * Meter Component
 *
 * A gauge for a scalar value within a known range — utilization, quota,
 * capacity, battery. The web-platform sibling of ProgressBar: `<meter>` is
 * "how full", `<progress>` is "how far along" (ARIA roles `meter` vs
 * `progressbar`). Use ProgressBar for task progress (it has indeterminate
 * mode and a percentage suffix); use Meter for level/utilization gauges.
 *
 * The filled segment is painted as a background block (not fill characters),
 * so a short semantic label — "13h 20m" until quota reset, "78%", "1.2 GB" —
 * can sit ON the bar. The label is fitted whole into the wider segment via
 * {@link fitSegmentLabel}; candidates are semantic alternatives
 * (richest-to-smallest), never character slices, so the label is complete or
 * absent, never clipped.
 *
 * Usage:
 * ```tsx
 * <Meter value={0.7} width={10} />
 * <Meter value={0.4} width={14} fillColor="$bg-warning" />
 * <Meter
 *   value={used / total}
 *   width={12}
 *   overlay={{
 *     candidates: ["13h 20m", "13h"],
 *     secondaryColor: "$fg-muted",
 *     isSecondaryChar: (c) => c >= "a" && c <= "z",
 *   }}
 * />
 * ```
 */
import React from "react"
import { useBoxSize } from "../../hooks/useLayout"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Segment-label fitting (pure)
// =============================================================================

/** Which side of a two-segment meter owns a fitted label. */
export type SegmentLabelRegion = "filled" | "empty"

/**
 * Cell plan for one semantic label. `paddedText` always includes exactly one
 * leading and one trailing cell; prefix/suffix cells fill the remainder of the
 * selected segment without clipping the label.
 */
export interface SegmentLabelFit {
  paddedText: string
  segment: SegmentLabelRegion
  prefixCells: number
  suffixCells: number
}

export interface FitSegmentLabelOptions {
  /** Richest-to-smallest semantic candidates. Never pass character slices. */
  candidates: readonly string[]
  filledCells: number
  emptyCells: number
}

function safeCells(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/**
 * Select one whole semantic label for a two-segment meter.
 *
 * Candidates are considered in semantic priority order. For a candidate that
 * fits, the larger segment wins; an equal-size tie keeps the established
 * colored/filled placement. Filled labels are left-aligned, while empty
 * (visually gray) labels are right-aligned. If neither segment can hold a
 * candidate plus one cell of padding on both sides, the label is omitted.
 *
 * Labels are assumed to be 1-column-per-char text (ASCII durations, percents,
 * byte counts) — cell math uses `String.length`.
 */
export function fitSegmentLabel({
  candidates,
  filledCells,
  emptyCells,
}: FitSegmentLabelOptions): SegmentLabelFit | null {
  const segments = [
    { segment: "filled" as const, cells: safeCells(filledCells), tieRank: 0 },
    { segment: "empty" as const, cells: safeCells(emptyCells), tieRank: 1 },
  ].sort((left, right) => right.cells - left.cells || left.tieRank - right.tieRank)

  for (const text of candidates) {
    if (text.length === 0) continue
    const paddedText = ` ${text} `
    const selected = segments.find((segment) => paddedText.length <= segment.cells)
    if (!selected) continue

    const remainder = selected.cells - paddedText.length
    return {
      paddedText,
      segment: selected.segment,
      prefixCells: selected.segment === "empty" ? remainder : 0,
      suffixCells: selected.segment === "filled" ? remainder : 0,
    }
  }

  return null
}

/**
 * Build richest-to-leading-unit label candidates without ever slicing
 * characters: `["3d", "20h", "10m"]` → `["3d 20h", "3d"]`. Meter reset/ETA
 * labels intentionally cap at two units to stay compact.
 */
export function leadingUnitLabelCandidates(
  units: readonly string[],
  maxUnits = 2,
): readonly string[] {
  const bounded = Math.max(0, Math.min(Math.floor(maxUnits), units.length))
  const candidates: string[] = []
  for (let count = bounded; count >= 1; count--) {
    candidates.push(units.slice(0, count).join(" "))
  }
  return candidates
}

/**
 * Number of filled cells for a meter value: `value` clamped to 0..1, `width`
 * floored to a non-negative cell count, half-cells rounded to nearest.
 * Shared by Meter and ProgressBar so there is exactly one fill-math authority.
 */
export function meterFilledCells(value: number, width: number): number {
  const safeWidth = safeCells(width)
  // Non-finite values clamp like their sign (NaN → empty) instead of
  // propagating NaN into cell counts and layout widths.
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : value > 0 ? 1 : 0
  return Math.max(0, Math.min(safeWidth, Math.round(clamped * safeWidth)))
}

// =============================================================================
// Types
// =============================================================================

/** Label ink pair for one meter segment. */
export interface MeterLabelColors {
  /** Ink for primary label chars — digits, spaces, punctuation. */
  color?: string
  /** Ink for secondary label chars (see `isSecondaryChar`), e.g. unit letters. */
  secondaryColor?: string
}

/**
 * A label fitted into the meter track. The label renders on whichever segment
 * {@link fitSegmentLabel} selects, on that segment's own paint (filled → the
 * fill color; empty → the empty-track paint), so it reads as part of the bar.
 */
export interface MeterOverlay extends MeterLabelColors {
  /** Richest-to-smallest semantic labels; candidates are never character-clipped. */
  candidates: readonly string[]
  /** Return true for chars that should use `secondaryColor`. Default: none. */
  isSecondaryChar?: (char: string) => boolean
  /** Per-segment ink overrides when one pair can't serve both paints. */
  filled?: MeterLabelColors
  empty?: MeterLabelColors
}

export interface MeterProps {
  /** Fill fraction 0-1, clamped. */
  value: number
  /** Width in columns (default: uses available width via useBoxSize) */
  width?: number
  /** Filled-segment paint (background). Default: `"$bg-accent"`. */
  fillColor?: string
  /**
   * Empty-track ink: foreground of `emptyChar` cells, and the backdrop behind
   * an overlay label that lands on the empty segment. Default: `"$fg-muted"`.
   */
  emptyColor?: string
  /** Empty-track glyph (1 column). Default: `"░"`. */
  emptyChar?: string
  /**
   * Optional solid paint behind the empty track (`emptyChar` cells AND the
   * empty-segment label backdrop). Use with `emptyChar=" "` for a solid block
   * track (the `ag status` look). Default: unpainted.
   */
  emptyBackgroundColor?: string
  /** Optional label fitted into the larger viable filled/empty segment. */
  overlay?: MeterOverlay | null
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_WIDTH = 30
const DEFAULT_FILL_COLOR = "$bg-accent"
const DEFAULT_EMPTY_COLOR = "$fg-muted"
const DEFAULT_EMPTY_CHAR = "░"

/** Primary label ink on the filled segment — text ON the accent fill. */
const DEFAULT_FILLED_LABEL_COLOR = "$fg-on-accent"
/** Primary label ink on the empty segment — readable on the muted track paint. */
const DEFAULT_EMPTY_LABEL_COLOR = "$fg"
/**
 * Secondary (unit-letter) label ink, both segments. Deliberately a single
 * parameterization point: Sterling's dedicated `$fg-faint` token for
 * deemphasized meter unit text slots in here — callers that never passed
 * `secondaryColor` pick it up for free.
 */
const DEFAULT_SECONDARY_LABEL_COLOR = "$fg-faint"

// =============================================================================
// Overlay label
// =============================================================================

interface LabelRun {
  text: string
  secondary: boolean
}

/** Coalesce label chars into primary/secondary runs (fewer Text nodes). */
function labelRuns(paddedText: string, isSecondaryChar: (char: string) => boolean): LabelRun[] {
  const runs: LabelRun[] = []
  for (const char of paddedText) {
    const secondary = isSecondaryChar(char)
    const last = runs[runs.length - 1]
    if (last && last.secondary === secondary) last.text += char
    else runs.push({ text: char, secondary })
  }
  return runs
}

function OverlayLabel({
  overlay,
  segment,
  paddedText,
  backgroundColor,
}: {
  overlay: MeterOverlay
  segment: SegmentLabelRegion
  paddedText: string
  backgroundColor?: string
}): React.ReactElement {
  const perSegment = segment === "filled" ? overlay.filled : overlay.empty
  const defaultColor = segment === "filled" ? DEFAULT_FILLED_LABEL_COLOR : DEFAULT_EMPTY_LABEL_COLOR
  const color = perSegment?.color ?? overlay.color ?? defaultColor
  const secondaryColor =
    perSegment?.secondaryColor ?? overlay.secondaryColor ?? DEFAULT_SECONDARY_LABEL_COLOR
  const isSecondaryChar = overlay.isSecondaryChar ?? (() => false)
  return (
    <>
      {labelRuns(paddedText, isSecondaryChar).map((run, i) => (
        <Text
          key={i}
          color={run.secondary ? secondaryColor : color}
          backgroundColor={backgroundColor}
        >
          {run.text}
        </Text>
      ))}
    </>
  )
}

// =============================================================================
// Component
// =============================================================================

export function Meter({
  value,
  width: widthProp,
  fillColor = DEFAULT_FILL_COLOR,
  emptyColor = DEFAULT_EMPTY_COLOR,
  emptyChar = DEFAULT_EMPTY_CHAR,
  emptyBackgroundColor,
  overlay,
}: MeterProps): React.ReactElement {
  // LAYOUT_READ_AT_RENDER: like ProgressBar, the auto-width path repeats
  // track characters across a resolved cell width, which needs the
  // post-layout width. Consumers may pass `width` to bypass this read
  // entirely. The hook observes only dimensions, so scroll-position-only
  // rect changes do not wake it.
  const { width: measuredWidth } = useBoxSize()
  const contentWidth = widthProp ? 0 : measuredWidth
  const availableWidth = widthProp ?? (contentWidth > 0 ? contentWidth : DEFAULT_WIDTH)

  const safeWidth = Math.max(0, Math.floor(availableWidth))
  const filled = meterFilledCells(value, safeWidth)
  const empty = Math.max(0, safeWidth - filled)
  const fit = overlay
    ? fitSegmentLabel({ candidates: overlay.candidates, filledCells: filled, emptyCells: empty })
    : null
  const emptyTrackBackdrop = emptyBackgroundColor ?? emptyColor

  return (
    <Box flexDirection="row" width={safeWidth} flexShrink={0}>
      {fit?.segment === "filled" && overlay ? (
        <>
          {fit.prefixCells > 0 ? (
            <Box backgroundColor={fillColor} width={fit.prefixCells} height={1} />
          ) : null}
          <OverlayLabel
            overlay={overlay}
            segment="filled"
            paddedText={fit.paddedText}
            backgroundColor={fillColor}
          />
          {fit.suffixCells > 0 ? (
            <Box backgroundColor={fillColor} width={fit.suffixCells} height={1} />
          ) : null}
        </>
      ) : filled > 0 ? (
        <Box backgroundColor={fillColor} width={filled} height={1} />
      ) : null}
      {fit?.segment === "empty" && overlay ? (
        <>
          {fit.prefixCells > 0 ? (
            <Text color={emptyColor} backgroundColor={emptyBackgroundColor}>
              {emptyChar.repeat(fit.prefixCells)}
            </Text>
          ) : null}
          <OverlayLabel
            overlay={overlay}
            segment="empty"
            paddedText={fit.paddedText}
            backgroundColor={emptyTrackBackdrop}
          />
          {fit.suffixCells > 0 ? (
            <Text color={emptyColor} backgroundColor={emptyBackgroundColor}>
              {emptyChar.repeat(fit.suffixCells)}
            </Text>
          ) : null}
        </>
      ) : empty > 0 ? (
        <Text color={emptyColor} backgroundColor={emptyBackgroundColor}>
          {emptyChar.repeat(empty)}
        </Text>
      ) : null}
    </Box>
  )
}

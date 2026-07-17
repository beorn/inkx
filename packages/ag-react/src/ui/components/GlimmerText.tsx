/**
 * GlimmerText Component
 *
 * A traveling highlight that sweeps left-to-right across the text while
 * `active` — the "this is running right now" affordance. A short span of
 * characters renders in `glimmerColor` and the span's position advances on
 * the shared synchronized-phase clock, so multiple glimmering lines sweep
 * in lockstep instead of strobing independently.
 *
 * Distinct from {@link TextShimmer}, which pulses the WHOLE text between two
 * colors: shimmer says "alive but waiting", glimmer says "sweeping through
 * work". Extracted from ag-chat-ui's activity line (`ActivityGlimmerText`)
 * so any app can use it; the sweep math is exported for unit tests and for
 * callers that paint cell-level effects themselves.
 *
 * Usage:
 * ```tsx
 * <GlimmerText
 *   active={isRunning}
 *   color="$fg-on-inverse-muted"
 *   glimmerColor="$fg-on-inverse"
 *   bold
 * >
 *   {commandLine}
 * </GlimmerText>
 * ```
 */
import React from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"
import { useSynchronizedPhase } from "./Pulse"

// =============================================================================
// Sweep math (pure, exported for tests and cell-level painters)
// =============================================================================

/** Characters lit at once as the sweep travels. */
export const GLIMMER_SPAN = 4

/**
 * Reference sweep width: texts shorter than this still take a full
 * reference-width cycle, so short labels sweep at the same apparent speed
 * as long ones instead of spinning faster.
 */
export const GLIMMER_REFERENCE_COLUMNS = 48

/** Default sweep period for a reference-width text, in ms. */
export const GLIMMER_PERIOD_MS = 1_800

/** Steps in one sweep cycle for a text of `length` characters. */
export function glimmerCycleLength(length: number): number {
  return Math.max(1, Math.floor(Math.max(length, GLIMMER_REFERENCE_COLUMNS)))
}

/** Period scaled so the sweep VELOCITY stays constant across text widths. */
export function glimmerPeriod(periodMs: number, length: number): number {
  return Math.max(
    1,
    Math.round((periodMs * glimmerCycleLength(length)) / GLIMMER_REFERENCE_COLUMNS),
  )
}

/** Whether the character at `index` is inside the lit span at `phase`. */
export function isGlimmerCell(index: number, phase: number, cycleLength: number): boolean {
  if (cycleLength <= 0) return false
  const distance = (index - phase + cycleLength) % cycleLength
  return distance < Math.min(GLIMMER_SPAN, cycleLength)
}

// =============================================================================
// Component
// =============================================================================

export interface GlimmerTextProps extends Omit<TextProps, "children"> {
  /** Text content — plain string; the sweep is per-character. */
  children: string
  /** Sweep runs only while true; otherwise renders as plain `<Text>`. Default true. */
  active?: boolean
  /** Base text color (also the resting color while inactive). */
  color?: string
  /** Color of the traveling span. Default `$fg`. */
  glimmerColor?: string
  /** Sweep period at reference width, in ms. Default 1800. */
  period?: number
}

export function GlimmerText({
  children,
  active = true,
  color,
  glimmerColor = "$fg",
  period = GLIMMER_PERIOD_MS,
  ...rest
}: GlimmerTextProps): React.ReactElement {
  const characters = Array.from(children)
  const cycleLength = glimmerCycleLength(characters.length)
  const phase = useSynchronizedPhase({
    active,
    periodMs: glimmerPeriod(period, characters.length),
    steps: cycleLength,
  })
  if (!active) {
    return (
      <Text color={color} {...rest}>
        {children}
      </Text>
    )
  }
  return (
    <Text {...rest}>
      {characters.map((character, index) => (
        <Text
          key={`${index}:${character}`}
          color={isGlimmerCell(index, phase, cycleLength) ? glimmerColor : color}
        >
          {character}
        </Text>
      ))}
    </Text>
  )
}

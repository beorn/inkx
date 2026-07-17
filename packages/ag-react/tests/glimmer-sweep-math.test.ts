/**
 * GlimmerText sweep math — pure-function regression tests.
 *
 * The traveling-highlight geometry is exported so callers (e.g. dutiful's
 * header) can paint cell-level sweeps themselves. These are the same three
 * functions the component uses, so a regression here regresses the live sweep:
 *
 *   - `glimmerCycleLength` floors short texts up to the reference width so a
 *     10-char label sweeps at the same apparent speed as a 100-char one.
 *   - `glimmerPeriod` scales the period with the cycle so the sweep VELOCITY
 *     (period / cycle) is constant across widths.
 *   - `isGlimmerCell` lights a fixed-width span that wraps around the cycle
 *     and never lights more cells than the cycle holds.
 *
 * Pure math: no renderer, no React, no phase clock.
 */
import { describe, expect, test } from "vitest"
import {
  GLIMMER_PERIOD_MS,
  GLIMMER_REFERENCE_COLUMNS,
  GLIMMER_SPAN,
  glimmerCycleLength,
  glimmerPeriod,
  isGlimmerCell,
} from "../src/ui/components/GlimmerText.tsx"

describe("glimmerCycleLength", () => {
  test("floors up to the reference width for short (and empty) texts", () => {
    expect(glimmerCycleLength(0)).toBe(GLIMMER_REFERENCE_COLUMNS)
    expect(glimmerCycleLength(10)).toBe(GLIMMER_REFERENCE_COLUMNS)
    expect(glimmerCycleLength(GLIMMER_REFERENCE_COLUMNS)).toBe(GLIMMER_REFERENCE_COLUMNS)
  })

  test("tracks the text width once it exceeds the reference", () => {
    expect(glimmerCycleLength(GLIMMER_REFERENCE_COLUMNS + 1)).toBe(GLIMMER_REFERENCE_COLUMNS + 1)
    expect(glimmerCycleLength(100)).toBe(100)
  })

  test("is never below 1 even for negative lengths", () => {
    expect(glimmerCycleLength(-5)).toBeGreaterThanOrEqual(1)
  })
})

describe("glimmerPeriod", () => {
  test("returns the reference period unchanged at reference width", () => {
    expect(glimmerPeriod(GLIMMER_PERIOD_MS, GLIMMER_REFERENCE_COLUMNS)).toBe(GLIMMER_PERIOD_MS)
  })

  test("keeps the sweep velocity (period / cycle) constant across widths", () => {
    const velocity = (length: number) =>
      glimmerPeriod(GLIMMER_PERIOD_MS, length) / glimmerCycleLength(length)
    const reference = GLIMMER_PERIOD_MS / GLIMMER_REFERENCE_COLUMNS
    for (const length of [1, 10, 48, 96, 200]) {
      expect(velocity(length)).toBeCloseTo(reference, 5)
    }
  })

  test("never returns a non-positive period", () => {
    expect(glimmerPeriod(0, 100)).toBeGreaterThanOrEqual(1)
  })
})

describe("isGlimmerCell", () => {
  test("lights exactly GLIMMER_SPAN contiguous cells from the phase", () => {
    const cycle = glimmerCycleLength(48)
    const lit = Array.from({ length: cycle }, (_, i) => isGlimmerCell(i, 0, cycle))
    expect(lit.slice(0, GLIMMER_SPAN).every(Boolean)).toBe(true)
    expect(lit[GLIMMER_SPAN]).toBe(false)
    expect(lit.filter(Boolean)).toHaveLength(GLIMMER_SPAN)
  })

  test("the lit span wraps around the end of the cycle", () => {
    const cycle = 48
    const phase = cycle - 2 // span straddles the wrap: {46, 47, 0, 1}
    expect(isGlimmerCell(46, phase, cycle)).toBe(true)
    expect(isGlimmerCell(47, phase, cycle)).toBe(true)
    expect(isGlimmerCell(0, phase, cycle)).toBe(true)
    expect(isGlimmerCell(1, phase, cycle)).toBe(true)
    expect(isGlimmerCell(2, phase, cycle)).toBe(false)
    expect(isGlimmerCell(45, phase, cycle)).toBe(false)
  })

  test("lights the same count of cells at every phase of the cycle", () => {
    const cycle = glimmerCycleLength(60)
    for (let phase = 0; phase < cycle; phase++) {
      const count = Array.from({ length: cycle }, (_, i) => isGlimmerCell(i, phase, cycle)).filter(
        Boolean,
      ).length
      expect(count).toBe(GLIMMER_SPAN)
    }
  })

  test("clamps the span to the cycle so a tiny cycle never double-lights", () => {
    // cycle smaller than the span: every cell lights exactly once, not span-many.
    expect(isGlimmerCell(0, 0, 2)).toBe(true)
    expect(isGlimmerCell(1, 0, 2)).toBe(true)
    const litInTinyCycle = [0, 1].filter((i) => isGlimmerCell(i, 0, 2)).length
    expect(litInTinyCycle).toBe(2)
  })

  test("guards a non-positive cycle length", () => {
    expect(isGlimmerCell(0, 0, 0)).toBe(false)
    expect(isGlimmerCell(3, 1, -4)).toBe(false)
  })
})

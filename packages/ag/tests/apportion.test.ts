/**
 * Property suite for the shared integer apportionment allocator.
 *
 * Eight properties, seeded-deterministic fuzz. P1 (monotone) is the
 * load-bearing one: it is the property the previous per-surface splitters
 * measurably violated (an element SHRINKING as the terminal WIDENS), and the
 * one largest-remainder rounding cannot provide (Alabama paradox).
 */
import { describe, expect, test } from "vitest"
import {
  apportion,
  apportionRealWidths,
  apportionTension,
  type ApportionOptions,
  type ApportionTrack,
} from "../src/apportion"

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const show = (tracks: ApportionTrack[]): string =>
  `[${tracks.map((c) => `${c.min}-${c.max}`).join(",")}]`

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Point properties P2-P6, P8 at one (tracks, width, options). */
function checkPoint(tracks: ApportionTrack[], width: number, options: ApportionOptions): void {
  const stretch = options.stretch ?? false
  const r = apportion(tracks, width, options)
  const hi = sum(tracks.map((c) => c.max))
  const tag = `tracks=${show(tracks)} W=${width} stretch=${stretch} -> ${JSON.stringify(r.widths)}`

  if (r.feasible) {
    // P2 exact sum (stretch is exempt for n == 0: nowhere to put the excess).
    const total = sum(r.widths)
    if (!stretch) expect(total, `P2 exact sum: ${tag}`).toBe(Math.min(width, hi))
    else if (tracks.length > 0) expect(total, `P2 exact sum: ${tag}`).toBe(width)
    // P3 floor.
    for (let i = 0; i < tracks.length; i++) {
      expect(r.widths[i]!, `P3 floor col ${i}: ${tag}`).toBeGreaterThanOrEqual(tracks[i]!.min)
    }
  }
  // P4 cap (no-stretch only).
  if (!stretch) {
    for (let i = 0; i < tracks.length; i++) {
      expect(r.widths[i]!, `P4 cap col ${i}: ${tag}`).toBeLessThanOrEqual(tracks[i]!.max)
    }
  }
  // P5 no starvation beside slack.
  const starved = r.widths.some((w, i) => w < tracks[i]!.min)
  const slack = r.widths.some((w, i) => w > tracks[i]!.max)
  expect(starved && slack, `P5 no starvation beside slack: ${tag}`).toBe(false)
  // P6 rigidity (under stretch above Σmax a rigid track does take excess, by design).
  if (r.feasible && (!stretch || width <= hi)) {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i]!.min === tracks[i]!.max) {
        expect(r.widths[i]!, `P6 rigidity col ${i}: ${tag}`).toBe(tracks[i]!.min)
      }
    }
  }
  // P8 determinism.
  const again = apportion(tracks, width, options)
  expect(again, `P8 determinism: ${tag}`).toEqual(r)
}

/** Sweep properties P1 (monotone) and P7 (one-cell steps) across consecutive widths. */
function checkSweep(
  tracks: ApportionTrack[],
  from: number,
  to: number,
  options: ApportionOptions,
): void {
  const stretch = options.stretch ?? false
  let prev = apportion(tracks, from, options)
  for (let width = from + 1; width <= to; width++) {
    const cur = apportion(tracks, width, options)
    for (let i = 0; i < tracks.length; i++) {
      const a = prev.widths[i]!
      const b = cur.widths[i]!
      const tag =
        `tracks=${show(tracks)} stretch=${stretch} col ${i}: W=${width - 1}->${width} ` +
        `${JSON.stringify(prev.widths)} -> ${JSON.stringify(cur.widths)}`
      expect(b, `P1 monotone: ${tag}`).toBeGreaterThanOrEqual(a)
      expect(Math.abs(b - a), `P7 one-cell steps: ${tag}`).toBeLessThanOrEqual(1)
    }
    prev = cur
  }
}

const DIRECTED: ApportionTrack[][] = [
  [],
  [{ min: 0, max: 0 }],
  [{ min: 5, max: 5 }],
  [
    { min: 0, max: 10 },
    { min: 0, max: 10 },
  ],
  [
    { min: 3, max: 3 },
    { min: 1, max: 40 },
  ],
  [
    { min: 0, max: 0 },
    { min: 0, max: 0 },
    { min: 0, max: 0 },
  ],
  [
    { min: 1, max: 1 },
    { min: 1, max: 2 },
    { min: 1, max: 3 },
  ],
  [
    { min: 10, max: 16 },
    { min: 12, max: 76 },
    { min: 52, max: 209 },
  ],
  [
    { min: 7, max: 7 },
    { min: 7, max: 7 },
  ],
  [
    { min: 0, max: 1 },
    { min: 0, max: 1 },
    { min: 0, max: 1 },
    { min: 0, max: 1 },
    { min: 0, max: 1 },
  ],
  [
    { min: 20, max: 21 },
    { min: 1, max: 200 },
  ],
]

function randomTracks(rnd: () => number, maxN: number, span: number): ApportionTrack[] {
  const n = 1 + Math.floor(rnd() * maxN)
  const tracks: ApportionTrack[] = []
  for (let i = 0; i < n; i++) {
    const min = Math.floor(rnd() * (span + 1))
    const max = min + Math.floor(rnd() * (span + 1))
    tracks.push({ min, max })
  }
  return tracks
}

describe("apportion properties", () => {
  test("directed cases: point properties at boundaries + full sweeps", () => {
    for (const tracks of DIRECTED) {
      const lo = sum(tracks.map((c) => c.min))
      const hi = sum(tracks.map((c) => c.max))
      for (const stretch of [false, true]) {
        const options = { stretch }
        for (const width of [
          0,
          Math.max(0, lo - 1),
          lo,
          Math.floor((lo + hi) / 2),
          hi,
          hi + 1,
          hi + 7,
          hi + 100,
        ]) {
          checkPoint(tracks, width, options)
        }
        checkSweep(tracks, Math.max(0, lo - 3), hi + 12, options)
      }
    }
  })

  test("seeded fuzz: small tables, exhaustive sweep over the interesting band", () => {
    const rnd = mulberry32(20260807)
    for (let k = 0; k < 1000; k++) {
      const tracks = randomTracks(rnd, 5, 12)
      const lo = sum(tracks.map((c) => c.min))
      const hi = sum(tracks.map((c) => c.max))
      const width = Math.max(0, lo - 2) + Math.floor(rnd() * (hi - lo + 12))
      for (const stretch of [false, true]) {
        checkPoint(tracks, width, { stretch })
        checkSweep(tracks, Math.max(0, lo - 2), hi + 6, { stretch })
      }
    }
  })

  test("seeded fuzz: realistically sized tables, windowed sweeps", () => {
    const rnd = mulberry32(20260808)
    for (let k = 0; k < 300; k++) {
      const tracks = randomTracks(rnd, 8, 120)
      const lo = sum(tracks.map((c) => c.min))
      const hi = sum(tracks.map((c) => c.max))
      for (const stretch of [false, true]) {
        for (const width of [
          0,
          lo - 1,
          lo,
          hi,
          hi + 1,
          lo + Math.floor(rnd() * Math.max(1, hi - lo)),
        ]) {
          checkPoint(tracks, Math.max(0, width), { stretch })
        }
        const start = Math.max(0, lo - 5 + Math.floor(rnd() * Math.max(1, hi - lo)))
        checkSweep(tracks, start, start + 60, { stretch })
      }
    }
  })
})

describe("apportion regression: the pm-plan I19 table", () => {
  // Measured on the real defect specimen: short id / medium label / long prose,
  // (min-content, max-content) per column including cell chrome.
  const I19: ApportionTrack[] = [
    { min: 10, max: 16 },
    { min: 12, max: 76 },
    { min: 52, max: 209 },
  ]

  test("W=69 is infeasible (Σmin=74) and REPORTED as such, never rendered as fitting", () => {
    const r = apportion(I19, 69)
    expect(r.feasible).toBe(false)
    expect(r.widths).toEqual([10, 12, 52])
  })

  test("interpolation matches the verified prototype at measured widths", () => {
    expect(apportion(I19, 74).widths).toEqual([10, 12, 52])
    expect(apportion(I19, 99).widths).toEqual([11, 19, 69])
    expect(apportion(I19, 159).widths).toEqual([12, 36, 111])
    expect(sum(apportion(I19, 159).widths)).toBe(159)
  })

  test("full-band monotonicity: no column ever shrinks as width grows (the resize-jitter gate)", () => {
    const lo = sum(I19.map((c) => c.min))
    const hi = sum(I19.map((c) => c.max))
    checkSweep(I19, lo, hi, {})
  })

  test("the Alabama-paradox witness cannot occur: W 92->93 moves exactly one column by one cell", () => {
    const a = apportion(I19, 92).widths
    const b = apportion(I19, 93).widths
    const deltas = b.map((w, i) => w - a[i]!)
    expect(deltas.filter((d) => d === 1)).toHaveLength(1)
    expect(deltas.filter((d) => d === 0)).toHaveLength(2)
  })
})

describe("apportion contract", () => {
  test("fractional inputs throw loudly instead of being silently floored", () => {
    expect(() => apportion([{ min: 0, max: 10.5 }], 5)).toThrow(/integers/)
    expect(() => apportion([{ min: 0, max: 10 }], 5.5)).toThrow(/integer/)
    expect(() => apportion([{ min: 5, max: 3 }], 5)).toThrow(/min <= max/)
  })

  test("tension reads: 0 at Σmin, 1 at Σmax, 1 when the band is degenerate", () => {
    const tracks: ApportionTrack[] = [
      { min: 2, max: 6 },
      { min: 3, max: 9 },
    ]
    expect(apportionTension(tracks, 5)).toBe(0)
    expect(apportionTension(tracks, 15)).toBe(1)
    expect(apportionTension([{ min: 4, max: 4 }], 4)).toBe(1)
  })

  test("real widths respect the same floors, caps, and exact sum inside the band", () => {
    const tracks: ApportionTrack[] = [
      { min: 1, max: 9 },
      { min: 4, max: 5 },
      { min: 0, max: 30 },
    ]
    for (let width = 5; width <= 44; width++) {
      const real = apportionRealWidths(tracks, width)
      expect(sum(real)).toBeCloseTo(Math.min(width, 44), 9)
      for (let i = 0; i < tracks.length; i++) {
        expect(real[i]!).toBeGreaterThanOrEqual(tracks[i]!.min)
        expect(real[i]!).toBeLessThanOrEqual(tracks[i]!.max)
      }
    }
  })
})

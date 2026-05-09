/**
 * Node ID factory — injection seam for deterministic IDs in tests.
 *
 * Production code calls `getIdFactory()()` to mint a new node ID. The
 * default factory delegates to `ulid()` (real time + crypto.random).
 *
 * Tests that need deterministic IDs (chaos / fuzz / round-trip) call
 * `setIdFactory(createDeterministicIdFactory({ time, prng }))` in setup
 * and `resetIdFactory()` in teardown. The seam exists because seeding
 * vimonkey's `gen()` only pins the EVENT sequence — node IDs minted by
 * `ulid()` use wall-clock + crypto.random independently and stay random
 * across runs, which makes any reconciler-correctness assertion that
 * compares IDs (or hashes derived from IDs) fundamentally flaky.
 *
 * See bead `@km/test-infra/deterministic-ulid-factory`.
 *
 * Scope: km-storage. `@km/fs-mount` and `@km/beads` still call `ulid()`
 * directly — migrating those is a follow-up. Tests that span those
 * packages will not be fully deterministic until that work lands.
 */

import { ulid, type PRNG } from "ulid"

/**
 * A function that produces a fresh node ID on each call. Returns a string
 * (typically a 26-char ULID) suitable for `KNode.id`.
 */
export type IdFactory = () => string

/**
 * Default factory — delegates to `ulid()` with no seed. Wall-clock time
 * + crypto.random per the ULID spec.
 */
export const defaultIdFactory: IdFactory = () => ulid()

/**
 * Build a deterministic factory pinned to a fixed time source and PRNG.
 *
 * @param opts.time A function returning the timestamp (ms since epoch) to
 *   embed in the next ULID. Default: a stable counter starting at
 *   `2026-01-01T00:00:00Z` and incrementing 1ms per call so consecutive
 *   IDs stay sortable.
 * @param opts.prng A function returning a number in [0, 1) used as the
 *   ULID's random component. Default: `Math.random` re-seeded to a
 *   deterministic stream from `opts.seed`. Pass a vimonkey
 *   `SeededRandom`-style `() => number` to fully pin output.
 * @param opts.seed When `prng` is omitted, seed for the default PRNG.
 */
export function createDeterministicIdFactory(opts: {
  time?: () => number
  prng?: PRNG
  seed?: number
} = {}): IdFactory {
  const baseTime = Date.UTC(2026, 0, 1)
  let tick = 0
  const time = opts.time ?? (() => baseTime + tick++)
  const prng = opts.prng ?? buildSeededPrng(opts.seed ?? 0)
  return () => ulid(time(), prng)
}

/** A tiny xorshift32 PRNG. Deterministic given a seed; fast; non-crypto. */
function buildSeededPrng(seed: number): PRNG {
  let state = (seed | 0) || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    // Map int32 to [0, 1) the same way Math.random does, biased toward 0.
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

let currentFactory: IdFactory = defaultIdFactory

/**
 * Get the active id factory. Production code calls `getIdFactory()()` to
 * mint a new node ID.
 */
export function getIdFactory(): IdFactory {
  return currentFactory
}

/**
 * Replace the active id factory. Tests typically pair this with a
 * `resetIdFactory()` in teardown so other tests aren't affected.
 *
 * @example
 *   beforeEach(() => setIdFactory(createDeterministicIdFactory({ seed: 42 })))
 *   afterEach(() => resetIdFactory())
 */
export function setIdFactory(factory: IdFactory): void {
  currentFactory = factory
}

/** Restore the default (non-deterministic) factory. */
export function resetIdFactory(): void {
  currentFactory = defaultIdFactory
}

/** Convenience: scope a test block to a deterministic factory and restore. */
export function withDeterministicIds<T>(
  opts: Parameters<typeof createDeterministicIdFactory>[0] | undefined,
  fn: () => T,
): T {
  const previous = currentFactory
  currentFactory = createDeterministicIdFactory(opts)
  try {
    return fn()
  } finally {
    currentFactory = previous
  }
}

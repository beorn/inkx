/**
 * Chaos Stream Transformers for FS sync testing
 *
 * Re-exports generic transformers from vimonkey/chaos and adds
 * FS-domain-specific transformers that know about FsEvent shape.
 */

import { dirname } from "path"
import type { SeededRandom } from "vimonkey"
import { chaos as baseChaos, builtinChaosRegistry, type ChaosConfig, type ChaosRegistry } from "vimonkey/chaos"
import type { FsEvent, ChaosScenarioType } from "./types.ts"

// Re-export generic transformers (operate on any AsyncIterable<T>)
export { drop, reorder, duplicate, type ChaosConfig } from "vimonkey/chaos"

/** Configuration for a chaos scenario in the transformer pipeline */
export interface ChaosTransformerConfig {
  type: ChaosScenarioType | "duplicate_events"
  params: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// FS-domain-specific transformers
// ---------------------------------------------------------------------------

/** Expand "change" events into [unlink, add] (editor atomic save pattern) */
export async function* atomicSave(
  source: AsyncIterable<FsEvent>,
  rate: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    if (event.type === "change" && rng.bool(rate)) {
      yield { ...event, type: "unlink" }
      yield { ...event, type: "add" }
    } else {
      yield event
    }
  }
}

/** Coalesce events from same directory into a single directory event */
async function* coalesce(
  source: AsyncIterable<FsEvent>,
  threshold: number,
  _rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  const buckets = new Map<string, FsEvent[]>()

  for await (const event of source) {
    const dir = dirname(event.path)
    let bucket = buckets.get(dir)
    if (!bucket) {
      bucket = []
      buckets.set(dir, bucket)
    }
    bucket.push(event)

    if (bucket.length >= threshold) {
      yield { type: "change", path: dir }
      buckets.set(dir, [])
    }
  }

  for (const [, remaining] of buckets) {
    for (const e of remaining) yield e
  }
}

/** For change/add events, yield additional change events (simulates partial writes) */
async function* partialWrite(source: AsyncIterable<FsEvent>, rate: number, rng: SeededRandom): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    if ((event.type === "change" || event.type === "add") && rng.bool(rate)) {
      yield event
      const extras = rng.int(1, 3)
      for (let i = 0; i < extras; i++) {
        yield { ...event, type: "change" }
      }
    } else {
      yield event
    }
  }
}

/** For add events, expand into a chain of renames */
async function* renameChain(source: AsyncIterable<FsEvent>, depth: number, rng: SeededRandom): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    if (event.type === "add" && rng.bool(0.5)) {
      const ext = event.path.match(/\.[^.]+$/)?.[0] ?? ""
      const base = ext ? event.path.slice(0, -ext.length) : event.path

      yield event

      let currentPath = event.path
      for (let i = 1; i <= depth; i++) {
        yield { ...event, type: "unlink", path: currentPath }
        currentPath = `${base}${i}${ext}`
        yield { ...event, type: "add", path: currentPath }
      }
    } else {
      yield event
    }
  }
}

// ---------------------------------------------------------------------------
// FS chaos registry — extends vimonkey built-in with domain-specific types
// ---------------------------------------------------------------------------

const FS_CHAOS_REGISTRY: ChaosRegistry<FsEvent> = {
  ...(builtinChaosRegistry as ChaosRegistry<FsEvent>),
  // Map km scenario names → generic transformer names
  queue_overflow: (s, p, rng) =>
    (builtinChaosRegistry as ChaosRegistry<FsEvent>).drop!(s, { rate: p.dropRate ?? 0.2 }, rng),
  reorder_chaos: (s, p, rng) => (builtinChaosRegistry as ChaosRegistry<FsEvent>).reorder!(s, p, rng),
  event_storm: (s, p) => (builtinChaosRegistry as ChaosRegistry<FsEvent>).burst!(s, p, {} as SeededRandom),
  slow_disk: (s, p, rng) => (builtinChaosRegistry as ChaosRegistry<FsEvent>).delay!(s, p, rng),
  // Domain-specific
  editor_atomic: (s, p, rng) => atomicSave(s, (p.rate as number) ?? 0.5, rng),
  duplicate_events: (s, p, rng) => (builtinChaosRegistry as ChaosRegistry<FsEvent>).duplicate!(s, p, rng),
  fsevents_coalesce: (s, p, rng) => coalesce(s, (p.threshold as number) ?? 10, rng),
  partial_writes: (s, p, rng) => partialWrite(s, (p.rate as number) ?? 0.3, rng),
  rename_storm: (s, p, rng) => renameChain(s, (p.depth as number) ?? 3, rng),
  rapid_succession: async function* (s) {
    for await (const e of s) yield e
  },
  init_gap: (s, p) => (builtinChaosRegistry as ChaosRegistry<FsEvent>).initGap!(s, p, {} as SeededRandom),
}

/**
 * Compose multiple chaos transformer configs into a single async iterable pipeline.
 * Uses FS-specific registry that maps km scenario names to transformers.
 */
export function chaos(
  source: AsyncIterable<FsEvent>,
  scenarios: ChaosTransformerConfig[],
  rng: SeededRandom,
): AsyncIterable<FsEvent> {
  return baseChaos(source, scenarios as ChaosConfig[], rng, FS_CHAOS_REGISTRY)
}

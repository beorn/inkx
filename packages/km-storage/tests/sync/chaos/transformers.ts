/**
 * Chaos Stream Transformers
 *
 * Composable async iterable transformers for chaos testing.
 * Each transformer sits between gen(fsEventPicker) and take(n)
 * as a pipeline stage that mutates, drops, reorders, or expands events.
 */

import { dirname } from "path"
import type { SeededRandom } from "vitestx"
import type { FsEvent, ChaosScenarioType } from "./types.ts"

/** Configuration for a chaos scenario in the transformer pipeline */
export interface ChaosTransformerConfig {
  type: ChaosScenarioType | "duplicate_events"
  params: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 1. drop — QUEUE_OVERFLOW
// Skip events with probability `rate`
// ---------------------------------------------------------------------------

export async function* drop(
  source: AsyncIterable<FsEvent>,
  rate: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    if (!rng.bool(rate)) yield event
  }
}

// ---------------------------------------------------------------------------
// 2. reorder — REORDER_CHAOS
// Buffer up to windowSize events, shuffle, yield when buffer is full
// ---------------------------------------------------------------------------

export async function* reorder(
  source: AsyncIterable<FsEvent>,
  windowSize: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  const buffer: FsEvent[] = []
  for await (const event of source) {
    buffer.push(event)
    if (buffer.length >= windowSize) {
      const shuffled = rng.shuffle(buffer)
      buffer.length = 0
      for (const e of shuffled) yield e
    }
  }
  // Flush remaining
  if (buffer.length > 0) {
    const shuffled = rng.shuffle(buffer)
    for (const e of shuffled) yield e
  }
}

// ---------------------------------------------------------------------------
// 3. atomicSave — EDITOR_ATOMIC
// Expand "change" events into [unlink original, add original]
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 4. duplicate — DUPLICATE_EVENTS
// With probability `rate`, yield the event twice
// ---------------------------------------------------------------------------

export async function* duplicate(
  source: AsyncIterable<FsEvent>,
  rate: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    yield event
    if (rng.bool(rate)) yield event
  }
}

// ---------------------------------------------------------------------------
// 5. coalesce — FSEVENTS_COALESCE
// When threshold events from the same directory accumulate, replace with
// a single directory "change" event
// ---------------------------------------------------------------------------

export async function* coalesce(
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
      // Coalesce: emit single directory change event
      yield { type: "change", path: dir }
      buckets.set(dir, [])
    }
  }

  // Flush remaining individual events below threshold
  for (const [, remaining] of buckets) {
    for (const e of remaining) yield e
  }
}

// ---------------------------------------------------------------------------
// 6. burst — EVENT_STORM
// Collect burstSize events, then yield them all at once
// ---------------------------------------------------------------------------

export async function* burst(
  source: AsyncIterable<FsEvent>,
  burstSize: number,
  _rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  const buffer: FsEvent[] = []
  for await (const event of source) {
    buffer.push(event)
    if (buffer.length >= burstSize) {
      for (const e of buffer) yield e
      buffer.length = 0
    }
  }
  // Flush remaining
  for (const e of buffer) yield e
}

// ---------------------------------------------------------------------------
// 7. delay — SLOW_DISK
// Add a random delay before yielding each event
// ---------------------------------------------------------------------------

export async function* delay(
  source: AsyncIterable<FsEvent>,
  minMs: number,
  maxMs: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    const ms = rng.int(minMs, maxMs)
    await new Promise((r) => setTimeout(r, ms))
    yield event
  }
}

// ---------------------------------------------------------------------------
// 8. partialWrite — PARTIAL_WRITES
// For "change"/"add" events, yield additional "change" events for same path
// ---------------------------------------------------------------------------

export async function* partialWrite(
  source: AsyncIterable<FsEvent>,
  rate: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
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

// ---------------------------------------------------------------------------
// 9. renameChain — RENAME_STORM
// For "add" events, expand into a chain of renames
// ---------------------------------------------------------------------------

export async function* renameChain(
  source: AsyncIterable<FsEvent>,
  depth: number,
  rng: SeededRandom,
): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    if (event.type === "add" && rng.bool(0.5)) {
      const ext = event.path.match(/\.[^.]+$/)?.[0] ?? ""
      const base = ext ? event.path.slice(0, -ext.length) : event.path

      // Initial add
      yield event

      // Chain of unlink old + add new
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
// 10. rapidSuccession — RAPID_SUCCESSION
// Identity passthrough (marks events as needing no delay)
// ---------------------------------------------------------------------------

export async function* rapidSuccession(
  source: AsyncIterable<FsEvent>,
): AsyncGenerator<FsEvent> {
  for await (const event of source) {
    yield event
  }
}

// ---------------------------------------------------------------------------
// 11. initGap — INIT_GAP
// Skip the first `count` events
// ---------------------------------------------------------------------------

export async function* initGap(
  source: AsyncIterable<FsEvent>,
  count: number,
): AsyncGenerator<FsEvent> {
  let skipped = 0
  for await (const event of source) {
    if (skipped < count) {
      skipped++
      continue
    }
    yield event
  }
}

// ---------------------------------------------------------------------------
// chaos() combinator
// Compose multiple transformer configs into a single pipeline
// ---------------------------------------------------------------------------

/** Apply a single transformer config to the pipeline */
function applyTransformer(
  source: AsyncIterable<FsEvent>,
  config: ChaosTransformerConfig,
  rng: SeededRandom,
): AsyncIterable<FsEvent> {
  const p = config.params
  switch (config.type) {
    case "queue_overflow":
      return drop(source, (p.dropRate as number) ?? 0.2, rng)
    case "reorder_chaos":
      return reorder(source, (p.windowSize as number) ?? 5, rng)
    case "editor_atomic":
      return atomicSave(source, (p.rate as number) ?? 0.5, rng)
    case "duplicate_events":
      return duplicate(source, (p.rate as number) ?? 0.3, rng)
    case "fsevents_coalesce":
      return coalesce(source, (p.threshold as number) ?? 10, rng)
    case "event_storm":
      return burst(source, (p.burstSize as number) ?? 10, rng)
    case "slow_disk":
      return delay(
        source,
        (p.minMs as number) ?? 1,
        (p.maxMs as number) ?? 5,
        rng,
      )
    case "partial_writes":
      return partialWrite(source, (p.rate as number) ?? 0.3, rng)
    case "rename_storm":
      return renameChain(source, (p.depth as number) ?? 3, rng)
    case "rapid_succession":
      return rapidSuccession(source)
    case "init_gap":
      return initGap(source, (p.count as number) ?? 5)
    default:
      return source
  }
}

/**
 * Compose multiple chaos transformer configs into a single async iterable pipeline.
 *
 * Each scenario config is applied in order, wrapping the source in successive
 * transformer stages. The result is a single AsyncIterable that lazily applies
 * all transformations as events flow through.
 */
export function chaos(
  source: AsyncIterable<FsEvent>,
  scenarios: ChaosTransformerConfig[],
  rng: SeededRandom,
): AsyncIterable<FsEvent> {
  let pipeline = source
  for (const s of scenarios) {
    pipeline = applyTransformer(pipeline, s, rng)
  }
  return pipeline
}

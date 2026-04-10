/**
 * Per-phase timing helper for vitest benchmarks.
 *
 * Wraps `silveryBenchStart()` / `silveryBenchStop()` from `@silvery/ag-term`
 * with a vitest-friendly accumulator that:
 *
 *  1. Accumulates phase timings across many bench iterations.
 *  2. Reports the breakdown (with percentages) once after all iterations.
 *  3. Writes the breakdown to a JSON sidecar so the bench-now.sh ritual can
 *     pick it up alongside the vitest output.
 *
 * Usage:
 *
 * ```ts
 * import { describe, bench, afterAll } from "vitest"
 * import { withBenchPhases, dumpBenchPhases } from "./helpers/bench-phases.ts"
 *
 * describe("Full pipeline: 20 j-presses", () => {
 *   const phases = withBenchPhases("cursor-perf-1000")
 *   bench("1000 cards", () => {
 *     phases.measure(() => {
 *       const { board } = createDriverTest(...)
 *       for (let i = 0; i < 20; i++) board.command("cursor_down")
 *     })
 *   })
 *   afterAll(() => dumpBenchPhases(phases))
 * })
 * ```
 *
 * The breakdown is appended to `benchmarks/results/.last-phases.json` so the
 * bench-now.sh ritual can read it without needing to parse vitest's stdout.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import {
  silveryBenchStart,
  silveryBenchStop,
  silveryBenchReset,
  silveryBenchOutputDetail,
  type SilveryBenchPhases,
  type SilveryBenchOutputDetail,
} from "@silvery/ag-term/pipeline"

// =============================================================================
// Types
// =============================================================================

export interface BenchPhaseRecord {
  /** Test name (e.g. "cursor-perf:1000-cards"). */
  name: string
  /** Number of bench iterations accumulated into this record. */
  iterations: number
  /** Wall-clock total ms across all iterations (set by measure()). */
  wallMs: number
  /** Sum of per-phase timings across iterations. */
  phases: SilveryBenchPhases
  /** Output-phase sub-timing detail (diffBuffers vs changesToAnsi). */
  outputDetail: SilveryBenchOutputDetail
}

export interface BenchPhasesAccumulator {
  /** Test name passed at construction. */
  readonly name: string
  /**
   * Run the body inside an instrumented bench iteration. Phase timings are
   * accumulated into the underlying record.
   */
  measure(body: () => void): void
  /** Snapshot the accumulator (for tests). */
  snapshot(): BenchPhaseRecord
}

// =============================================================================
// Factory
// =============================================================================

const records: BenchPhaseRecord[] = []

// Dump-on-exit: vitest bench doesn't reliably run afterAll hooks for bench
// describes, so we register a process exit handler that flushes the records
// to disk. Stdout printing happens whenever a test calls dumpBenchPhases()
// directly. This handler is idempotent — only the first call writes.
let _exitHookRegistered = false
function ensureExitHook(): void {
  if (_exitHookRegistered) return
  _exitHookRegistered = true
  process.on("beforeExit", () => {
    if (records.some((r) => r.iterations > 0)) {
      writeBenchPhasesSidecar()
    }
  })
}

function emptyPhases(): SilveryBenchPhases {
  return {
    measure: 0,
    layout: 0,
    scroll: 0,
    scrollRect: 0,
    notify: 0,
    layoutTotal: 0,
    content: 0,
    output: 0,
    total: 0,
    reconcile: 0,
    pipelineCalls: 0,
    renderCalls: 0,
  }
}

/**
 * Create a per-phase accumulator scoped to a single bench. The same name can
 * appear in multiple bench files — they accumulate into the same record.
 */
export function withBenchPhases(name: string): BenchPhasesAccumulator {
  ensureExitHook()
  let record = records.find((r) => r.name === name)
  if (!record) {
    record = {
      name,
      iterations: 0,
      wallMs: 0,
      phases: emptyPhases(),
      outputDetail: { diffMs: 0, ansiMs: 0, calls: 0, totalChanges: 0, dirtyRows: 0, outputBytes: 0 },
    }
    records.push(record)
  }
  const r = record
  return {
    name,
    measure(body: () => void): void {
      // Start a fresh accumulator for THIS iteration. We don't accumulate
      // directly into the record because multiple benches may share the
      // global instrumentation namespace and we want clean per-iteration data.
      const phases = silveryBenchStart()
      const t0 = performance.now()
      try {
        body()
      } finally {
        const wall = performance.now() - t0
        silveryBenchStop()
        r.iterations += 1
        r.wallMs += wall
        r.phases.measure += phases.measure
        r.phases.layout += phases.layout
        r.phases.scroll += phases.scroll
        r.phases.scrollRect += phases.scrollRect
        r.phases.notify += phases.notify
        r.phases.layoutTotal += phases.layoutTotal
        r.phases.content += phases.content
        r.phases.output += phases.output
        r.phases.total += phases.total
        r.phases.reconcile += phases.reconcile
        r.phases.pipelineCalls += phases.pipelineCalls
        r.phases.renderCalls += phases.renderCalls
        // Capture output-phase sub-timing
        const outDetail = silveryBenchOutputDetail()
        if (outDetail) {
          r.outputDetail.diffMs += outDetail.diffMs
          r.outputDetail.ansiMs += outDetail.ansiMs
          r.outputDetail.calls += outDetail.calls
          r.outputDetail.totalChanges += outDetail.totalChanges
          r.outputDetail.dirtyRows += outDetail.dirtyRows
          r.outputDetail.outputBytes += outDetail.outputBytes
        }
        silveryBenchReset()
        // Eagerly persist the sidecar after each iteration. vitest bench
        // workers may exit without firing afterAll/beforeExit reliably, so
        // writing on every iteration guarantees the file exists when the
        // bench harness terminates. The file is small (a few KB) and writes
        // are O(records) so this is cheap.
        try {
          writeBenchPhasesSidecar()
        } catch {
          // ignore — sidecar is best-effort
        }
      }
    },
    snapshot(): BenchPhaseRecord {
      return JSON.parse(JSON.stringify(r)) as BenchPhaseRecord
    },
  }
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Format a single record as a human-readable breakdown. Mirrors the format
 * the bead description shows: total + per-phase ms + percentage.
 */
export function formatBenchPhases(record: BenchPhaseRecord): string {
  const i = record.iterations
  if (i === 0) return `[bench-phases] ${record.name}: 0 iterations\n`
  const wall = record.wallMs / i
  const phases = record.phases
  const layoutSide = phases.layoutTotal / i
  const content = phases.content / i
  const output = phases.output / i
  const reconcile = phases.reconcile / i
  // "other" captures everything not in measure/layout/content/output/reconcile:
  // setup costs, store updates, key handling, the act() wrapper, etc.
  const accounted = layoutSide + content + output + reconcile
  const other = Math.max(0, wall - accounted)

  const pct = (ms: number) => (wall === 0 ? "0%" : `${((ms / wall) * 100).toFixed(0)}%`)
  const fmt = (label: string, ms: number) => `    ${label.padEnd(18)} ${ms.toFixed(2)}ms (${pct(ms)})`

  const od = record.outputDetail
  const odCalls = od.calls || 1
  const lines = [
    `[bench-phases] ${record.name}`,
    `  iterations:        ${i}`,
    `  wall (per iter):   ${wall.toFixed(2)}ms`,
    `  pipeline calls:    ${phases.pipelineCalls}`,
    fmt("react reconcile", reconcile),
    fmt("layout side", layoutSide),
    fmt("  measure", phases.measure / i),
    fmt("  flexbox layout", phases.layout / i),
    fmt("  scroll", phases.scroll / i),
    fmt("  scrollRect", phases.scrollRect / i),
    fmt("  notify", phases.notify / i),
    fmt("content (render)", content),
    fmt("output (diff/ANSI)", output),
  ]
  if (od.calls > 0) {
    lines.push(
      fmt("  diffBuffers", od.diffMs / i),
      fmt("  changesToAnsi", od.ansiMs / i),
      `    changes/call:    ${(od.totalChanges / odCalls).toFixed(0)}`,
      `    dirty rows/call: ${(od.dirtyRows / odCalls).toFixed(0)}`,
      `    bytes/call:      ${(od.outputBytes / odCalls).toFixed(0)}`,
    )
  }
  lines.push(fmt("other", other), "")
  return lines.join("\n")
}

/**
 * Print and persist all accumulated records to:
 *   1. stdout (so vitest captures it),
 *   2. `benchmarks/results/.last-phases.json` (so bench-now.sh can read it).
 *
 * Idempotent: only writes records that have non-zero iterations. Safe to call
 * from multiple `afterAll` blocks — the file is overwritten each call with
 * the latest snapshot.
 */
export function dumpBenchPhases(...accumulators: BenchPhasesAccumulator[]): void {
  const wanted = accumulators.length > 0 ? new Set(accumulators.map((a) => a.name)) : null
  const filtered = wanted
    ? records.filter((r) => wanted.has(r.name) && r.iterations > 0)
    : records.filter((r) => r.iterations > 0)
  if (filtered.length === 0) return

  for (const r of filtered) {
    process.stdout.write(formatBenchPhases(r))
  }

  writeBenchPhasesSidecar()
}

/**
 * Write all non-empty records to the sidecar JSON file. Called automatically
 * on process exit (for vitest bench, where afterAll hooks aren't reliable),
 * and explicitly by `dumpBenchPhases()`.
 */
export function writeBenchPhasesSidecar(): void {
  const filtered = records.filter((r) => r.iterations > 0)
  if (filtered.length === 0) return

  // Persist to disk so external scripts can pick up the data.
  // Resolve via the helpers dir to avoid hardcoding cwd assumptions.
  const repoRoot = resolve(import.meta.dirname, "../../../..")
  const sidecarPath = resolve(repoRoot, "benchmarks/results/.last-phases.json")
  mkdirSync(dirname(sidecarPath), { recursive: true })

  // Merge with any existing data so multiple bench files don't clobber each other.
  let existing: BenchPhaseRecord[] = []
  if (existsSync(sidecarPath)) {
    try {
      existing = JSON.parse(readFileSync(sidecarPath, "utf8")) as BenchPhaseRecord[]
    } catch {
      existing = []
    }
  }
  const byName = new Map(existing.map((r) => [r.name, r]))
  for (const r of filtered) byName.set(r.name, r)
  const merged = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(sidecarPath, `${JSON.stringify(merged, null, 2)}\n`)
}

/**
 * Reset the global record store. Use in test setup if you need a clean slate.
 */
export function resetBenchPhases(): void {
  records.length = 0
}

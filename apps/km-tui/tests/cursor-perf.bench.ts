/**
 * Cursor Navigation Performance Benchmark
 *
 * Targets the O(N) findIndex bottleneck in view-navigation.ts getSibling().
 * With /tmp/vt vault dirs (~3700 siblings), every j/k press scans the full array.
 *
 * The "Full pipeline" benches use `withBenchPhases()` to break wall-clock down
 * by render phase (reconcile / measure / layout / content / output / other).
 * The breakdown is dumped to stdout via `afterAll(dumpBenchPhases)` and also
 * written to `benchmarks/results/.last-phases.json` for the bench-now.sh ritual
 * to consume.
 *
 * Run: bunx --bun vitest bench --run apps/km-tui/tests/cursor-perf.bench.ts
 */

import { afterAll, bench, describe } from "vitest"
import { createFakeRepo, type Repo } from "@km/storage"
import { item, testEnv } from "./helpers/board-test.ts"
import { dumpBenchPhases, withBenchPhases } from "./helpers/bench-phases.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Fixtures
// =============================================================================

/** Create a board with one column containing N cards (mimics /tmp/vt contacts dir) */
function largeColumnFixture(n: number): KNode[] {
  const cards: KNode[][] = []
  for (let i = 0; i < n; i++) {
    cards.push(item(`card-${i}`))
  }
  return item("board", item("col-big", ...cards))
}

/** Create a board with multiple columns, each with N cards */
function multiColumnFixture(cols: number, cardsPerCol: number): KNode[] {
  const columns: KNode[][] = []
  for (let c = 0; c < cols; c++) {
    const cards: KNode[][] = []
    for (let i = 0; i < cardsPerCol; i++) {
      cards.push(item(`c${c}-${i}`))
    }
    columns.push(item(`col-${c}`, ...cards))
  }
  return item("board", ...columns)
}

// =============================================================================
// Micro-benchmarks: getSibling via getChildren + findIndex
// (Isolates the navigation bottleneck from rendering)
// =============================================================================

describe("getSibling overhead (getChildren + findIndex)", () => {
  // Simulate what getSibling does: getChildren(parent) + findIndex(nodeId)
  function getSiblingViaFindIndex(repo: Repo, nodeId: string, delta: 1 | -1): string | null {
    const node = repo.getNode(nodeId)
    if (!node) return null
    const siblings = repo.getChildren(node.parent_id)
    const idx = siblings.findIndex((n) => n.id === nodeId)
    if (idx < 0) return null
    const targetIdx = idx + delta
    if (targetIdx < 0 || targetIdx >= siblings.length) return null
    return siblings[targetIdx]?.id ?? null
  }

  for (const n of [100, 500, 1000, 2000, 3700]) {
    bench(
      `${n} siblings — 50 moves`,
      () => {
        const nodes = largeColumnFixture(n)
        const repo = createFakeRepo({ nodes })
        // Start at middle of the list
        const startIdx = Math.floor(n / 2)
        let currentId = `card-${startIdx}`
        for (let i = 0; i < 50; i++) {
          const next = getSiblingViaFindIndex(repo, currentId, 1)
          if (next) currentId = next
          else {
            // Wrap back to start
            currentId = `card-${startIdx}`
          }
        }
      },
      { iterations: 20, warmupIterations: 5 },
    )
  }
})

// =============================================================================
// Full-pipeline: cursor movement on large board (includes React render)
// =============================================================================

describe("Full pipeline: j-press on large column (200x60)", () => {
  const accumulators: ReturnType<typeof withBenchPhases>[] = []
  for (const n of [100, 500, 1000, 2000, 3700]) {
    const phases = withBenchPhases(`cursor-perf:200x60:${n}-cards`)
    accumulators.push(phases)
    bench(
      `${n} cards — 20 j-presses`,
      () => {
        phases.measure(() => {
          const { board } = testEnv(() => largeColumnFixture(n), {
            columns: 200,
            rows: 60,
          })
          for (let i = 0; i < 20; i++) board.command("cursor_down")
        })
      },
      { iterations: 5, warmupIterations: 2 },
    )
  }
  afterAll(() => dumpBenchPhases(...accumulators))
})

describe("Full pipeline: j-press on large column (400x200)", () => {
  const accumulators: ReturnType<typeof withBenchPhases>[] = []
  for (const n of [500, 2000, 3700]) {
    const phases = withBenchPhases(`cursor-perf:400x200:${n}-cards`)
    accumulators.push(phases)
    bench(
      `${n} cards — 20 j-presses`,
      () => {
        phases.measure(() => {
          const { board } = testEnv(() => largeColumnFixture(n), {
            columns: 400,
            rows: 200,
          })
          for (let i = 0; i < 20; i++) board.command("cursor_down")
        })
      },
      { iterations: 5, warmupIterations: 2 },
    )
  }
  afterAll(() => dumpBenchPhases(...accumulators))
})

describe("Full pipeline: h/l on multi-column (3 cols × 1000)", () => {
  const phases = withBenchPhases("cursor-perf:multi-3x1000:right")
  bench(
    "navigate right across columns",
    () => {
      phases.measure(() => {
        const { board } = testEnv(() => multiColumnFixture(3, 1000), {
          columns: 200,
          rows: 60,
        })
        // Move down into cards then across columns
        for (let i = 0; i < 5; i++) board.command("cursor_down")
        for (let i = 0; i < 2; i++) board.command("cursor_right")
      })
    },
    { iterations: 5, warmupIterations: 2 },
  )
  afterAll(() => dumpBenchPhases(phases))
})

/**
 * Cold Start / Startup Benchmark
 *
 * Measures the cost of setting up a km board from scratch — the work that
 * happens on every app launch between "process starts" and "first frame visible".
 *
 * Phases measured:
 *   1. Board setup — createFakeRepo + store + lens construction
 *   2. First render — testEnv setup + React reconciliation + silvery pipeline → first frame
 *   3. Full startup — createBoardTest end-to-end → interactive frame
 *
 * Note: Module import time cannot be meaningfully benchmarked with vitest bench
 * because the module system caches after first load. Import cost is captured
 * implicitly in the first-render and full-startup numbers.
 *
 * Perf budget: < 500ms total cold start (see docs/guide/benchmarking.md)
 *
 * Run: bun vitest bench benchmarks/startup.bench.ts
 */

import { bench, describe } from "vitest"
import { createFakeRepo, createStoreFromRepo, withReactive } from "@km/storage"
import { createViewLens, createVisibleLens } from "@km/board"
import { item, testEnv } from "../apps/km-tui/tests/helpers/board-test.ts"
import { createBoardTest } from "../apps/km-tui/src/testing.ts"

// =============================================================================
// Fixture: small board (3 columns, 7 cards) — representative of a fresh vault
// =============================================================================

function boardFixture() {
  return item(
    "board",
    item("Todo", item("Buy groceries"), item("Write tests"), item("Review PR")),
    item("In Progress", item("Startup benchmark"), item("Fix layout bug")),
    item("Done", item("Set up CI"), item("Deploy v1")),
  )
}

// =============================================================================
// Phase 1: Board setup (repo + store + lens — no rendering)
// =============================================================================

describe("Board setup (no rendering)", () => {
  bench(
    "createFakeRepo + reactive store (3 cols, 7 cards)",
    () => {
      const nodes = boardFixture()
      const repo = createFakeRepo({ nodes })
      const store = withReactive(createStoreFromRepo(repo))
      if (!store) throw new Error("store not created")
    },
    { iterations: 20, warmupIterations: 5 },
  )

  bench(
    "createFakeRepo + viewLens + visibleLens (3 cols, 7 cards)",
    () => {
      const nodes = boardFixture()
      const repo = createFakeRepo({ nodes })
      const rootId = nodes[0]!.id
      const viewLens = createViewLens(repo, { rootId, foldDepths: new Map() })
      const visibleLens = createVisibleLens(viewLens)
      const cols = [...visibleLens.children(rootId)]
      if (cols.length === 0) throw new Error("no columns")
    },
    { iterations: 20, warmupIterations: 5 },
  )
})

// =============================================================================
// Phase 2: First render (testEnv → first frame with React + silvery pipeline)
// =============================================================================

describe("First render (testEnv → first frame)", () => {
  bench(
    "80x24 — 3 cols, 7 cards",
    () => {
      const { board } = testEnv(() => boardFixture(), { columns: 80, rows: 24 })
      const text = board.screenshot()
      if (!text || text.length === 0) throw new Error("no first frame")
    },
    { iterations: 10, warmupIterations: 3 },
  )

  bench(
    "200x60 — 3 cols, 7 cards",
    () => {
      const { board } = testEnv(() => boardFixture(), { columns: 200, rows: 60 })
      const text = board.screenshot()
      if (!text || text.length === 0) throw new Error("no first frame")
    },
    { iterations: 10, warmupIterations: 3 },
  )
})

// =============================================================================
// Phase 3: Full startup (createBoardTest end-to-end → interactive frame)
// =============================================================================

describe("Full startup (createBoardTest → interactive frame)", () => {
  bench(
    "80x24 — 3 cols, 7 cards",
    async () => {
      const nodes = boardFixture()
      const repo = createFakeRepo({ nodes })
      const harness = await createBoardTest(repo, { width: 80, height: 24 })
      const screenshot = harness.screenshot()
      if (!screenshot || screenshot.length === 0) throw new Error("no frame rendered")
      harness.unmount()
    },
    { iterations: 10, warmupIterations: 3 },
  )

  bench(
    "200x60 — 3 cols, 7 cards",
    async () => {
      const nodes = boardFixture()
      const repo = createFakeRepo({ nodes })
      const harness = await createBoardTest(repo, { width: 200, height: 60 })
      const screenshot = harness.screenshot()
      if (!screenshot || screenshot.length === 0) throw new Error("no frame rendered")
      harness.unmount()
    },
    { iterations: 10, warmupIterations: 3 },
  )
})

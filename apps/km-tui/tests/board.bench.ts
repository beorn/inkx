/**
 * Board Layout Performance Benchmark
 *
 * Tests the actual km Board component layout performance using the same
 * test infrastructure as board.spec.ts.
 *
 * Runs benchmarks for BOTH layout engines by default. Set env vars to filter:
 *   INKX_ENGINE=flexx  - Only run flexx benchmarks
 *   INKX_ENGINE=yoga   - Only run yoga benchmarks
 *
 * Run:
 *   bun bench apps/km-tui/tests/board.bench.ts
 *   INKX_ENGINE=flexx bun bench apps/km-tui/tests/board.bench.ts
 */

import { bench, describe, beforeAll } from "vitest"
import {
  createFlexxEngine,
  initYogaEngine,
  setLayoutEngine,
  type LayoutEngine,
} from "inkx"
import { item, testEnv } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

// Check for engine filter via env var
const ENGINE_FILTER = process.env.INKX_ENGINE?.toLowerCase() as
  | "flexx"
  | "yoga"
  | undefined
const RUN_FLEXX = !ENGINE_FILTER || ENGINE_FILTER === "flexx"
const RUN_YOGA = !ENGINE_FILTER || ENGINE_FILTER === "yoga"

if (ENGINE_FILTER) {
  console.warn(
    `[bench] INKX_ENGINE=${ENGINE_FILTER} - running only ${ENGINE_FILTER} benchmarks`,
  )
}

// Very low iteration for fast feedback (user can increase via vitest config)
const BENCH_OPTIONS = { iterations: 1, warmupIterations: 0 }

// Initialize engines once
let flexxEngine: LayoutEngine
let yogaEngine: LayoutEngine

beforeAll(async () => {
  if (RUN_FLEXX) flexxEngine = createFlexxEngine()
  if (RUN_YOGA) yogaEngine = await initYogaEngine()
})

// ============================================================================
// Engine-Aware Test Helper
// ============================================================================

/**
 * Run testEnv with a specific layout engine
 */
function testEnvWithEngine(engine: LayoutEngine, treeBuilder: () => KNode[]) {
  setLayoutEngine(engine)
  testEnv(treeBuilder)
}

// ============================================================================
// Fixture Generators
// ============================================================================

function createLargeBoard(numCols: number, cardsPerCol: number) {
  const columns = []
  for (let col = 0; col < numCols; col++) {
    const cards = []
    for (let card = 0; card < cardsPerCol; card++) {
      cards.push(item(`c${col}-${card}`))
    }
    columns.push(item(`col${col}`, ...cards))
  }
  return item("board", ...columns)
}

function createDeepTree(depth: number, breadth: number, prefix = "") {
  if (depth === 0) {
    return item(`${prefix}leaf`)
  }
  const children = []
  for (let i = 0; i < breadth; i++) {
    children.push(createDeepTree(depth - 1, breadth, `${prefix}${i}-`))
  }
  return item(`${prefix}node`, ...children)
}

// ============================================================================
// Benchmarks - Both Engines (filtered by INKX_ENGINE env var)
// ============================================================================

// Flexx Engine
if (RUN_FLEXX) {
  describe("Board Layout [flexx] - Kanban", () => {
    bench(
      "5 cols × 30 cards (~160 nodes)",
      () => {
        testEnvWithEngine(flexxEngine, () => createLargeBoard(5, 30))
      },
      BENCH_OPTIONS,
    )

    bench(
      "10 cols × 100 cards (~1010 nodes)",
      () => {
        testEnvWithEngine(flexxEngine, () => createLargeBoard(10, 100))
      },
      BENCH_OPTIONS,
    )
  })

  describe("Board Layout [flexx] - Deep Tree", () => {
    bench(
      "depth=4 breadth=4 (~341 nodes)",
      () => {
        testEnvWithEngine(flexxEngine, () => createDeepTree(4, 4))
      },
      BENCH_OPTIONS,
    )

    bench(
      "depth=5 breadth=3 (~364 nodes)",
      () => {
        testEnvWithEngine(flexxEngine, () => createDeepTree(5, 3))
      },
      BENCH_OPTIONS,
    )
  })
}

// Yoga Engine
if (RUN_YOGA) {
  describe("Board Layout [yoga] - Kanban", () => {
    bench(
      "5 cols × 30 cards (~160 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createLargeBoard(5, 30))
      },
      BENCH_OPTIONS,
    )

    bench(
      "10 cols × 100 cards (~1010 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createLargeBoard(10, 100))
      },
      BENCH_OPTIONS,
    )
  })

  describe("Board Layout [yoga] - Deep Tree", () => {
    bench(
      "depth=4 breadth=4 (~341 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createDeepTree(4, 4))
      },
      BENCH_OPTIONS,
    )

    bench(
      "depth=5 breadth=3 (~364 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createDeepTree(5, 3))
      },
      BENCH_OPTIONS,
    )
  })
}

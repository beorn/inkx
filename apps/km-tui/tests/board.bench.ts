/**
 * Board Layout Performance Benchmark
 *
 * Tests the actual km Board component layout performance using the same
 * test infrastructure as board.spec.ts.
 *
 * Runs benchmarks for BOTH layout engines by default. Set env vars to filter:
 *   SILVERY_ENGINE=flexily  - Only run flexily benchmarks
 *   SILVERY_ENGINE=yoga   - Only run yoga benchmarks
 *
 * Run:
 *   bun bench apps/km-tui/tests/board.bench.ts
 *   SILVERY_ENGINE=flexily bun bench apps/km-tui/tests/board.bench.ts
 */

import { bench, describe, beforeAll } from "vitest"
import { createFlexilyEngine, initYogaEngine, setLayoutEngine, type LayoutEngine } from "@silvery/ag-react"
import { item, testEnv } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

// Check for engine filter via env var
const ENGINE_FILTER = process.env.SILVERY_ENGINE?.toLowerCase() as "flexily" | "yoga" | undefined
const RUN_FLEXILY = !ENGINE_FILTER || ENGINE_FILTER === "flexily"
const RUN_YOGA = !ENGINE_FILTER || ENGINE_FILTER === "yoga"

if (ENGINE_FILTER) {
  console.warn(`[bench] SILVERY_ENGINE=${ENGINE_FILTER} - running only ${ENGINE_FILTER} benchmarks`)
}

// Very low iteration for fast feedback (user can increase via vitest config)
const BENCH_OPTIONS = { iterations: 1, warmupIterations: 0 }

// Initialize engines once
let flexilyEngine: LayoutEngine
let yogaEngine: LayoutEngine

beforeAll(async () => {
  if (RUN_FLEXILY) flexilyEngine = createFlexilyEngine()
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

function createDeepTree(depth: number, breadth: number, prefix = ""): KNode[] {
  if (depth === 0) {
    return item(`${prefix}leaf`)
  }
  const children = []
  for (let i = 0; i < breadth; i++) {
    children.push(createDeepTree(depth - 1, breadth, `${prefix}${i}-`))
  }
  return item(`${prefix}node`, ...children)
}

// Wide flat: many siblings, shallow depth (like a spreadsheet)
function createWideFlat(width: number, rows: number) {
  const rowNodes = []
  for (let r = 0; r < rows; r++) {
    const cells = []
    for (let c = 0; c < width; c++) {
      cells.push(item(`r${r}c${c}`))
    }
    rowNodes.push(item(`row${r}`, ...cells))
  }
  return item("grid", ...rowNodes)
}

// Deep chain: single chain of deeply nested nodes
function createDeepChain(depth: number) {
  let node = item("leaf")
  for (let i = depth - 1; i >= 0; i--) {
    node = item(`d${i}`, node)
  }
  return node
}

// Mixed: realistic - some wide, some deep
function createMixed(cols: number, cardsPerCol: number, nestDepth: number) {
  const columns = []
  for (let c = 0; c < cols; c++) {
    const cards = []
    for (let i = 0; i < cardsPerCol; i++) {
      // Every 5th card has nested children
      if (i % 5 === 0 && nestDepth > 0) {
        const nested = []
        for (let n = 0; n < nestDepth; n++) {
          nested.push(item(`c${c}-${i}-n${n}`))
        }
        cards.push(item(`c${c}-${i}`, ...nested))
      } else {
        cards.push(item(`c${c}-${i}`))
      }
    }
    columns.push(item(`col${c}`, ...cards))
  }
  return item("board", ...columns)
}

// ============================================================================
// Benchmarks - Both Engines (filtered by SILVERY_ENGINE env var)
// ============================================================================

// Flexily Engine
if (RUN_FLEXILY) {
  describe("Board Layout [flexily] - Kanban", () => {
    bench(
      "5 cols × 30 cards (~160 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createLargeBoard(5, 30))
      },
      BENCH_OPTIONS,
    )

    bench(
      "10 cols × 100 cards (~1010 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createLargeBoard(10, 100))
      },
      BENCH_OPTIONS,
    )

    bench(
      "15 cols × 200 cards (~3015 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createLargeBoard(15, 200))
      },
      BENCH_OPTIONS,
    )

    bench(
      "20 cols × 250 cards (~5020 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createLargeBoard(20, 250))
      },
      BENCH_OPTIONS,
    )

    bench(
      "25 cols × 400 cards (~10025 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createLargeBoard(25, 400))
      },
      BENCH_OPTIONS,
    )

    bench(
      "30 cols × 500 cards (~15030 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createLargeBoard(30, 500))
      },
      BENCH_OPTIONS,
    )
  })

  describe("Board Layout [flexily] - Deep Tree", () => {
    bench(
      "depth=4 breadth=4 (~341 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createDeepTree(4, 4))
      },
      BENCH_OPTIONS,
    )

    bench(
      "depth=5 breadth=3 (~364 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createDeepTree(5, 3))
      },
      BENCH_OPTIONS,
    )
  })

  describe("Board Layout [flexily] - Shapes", () => {
    bench(
      "wide-flat 100×50 (~5050 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createWideFlat(100, 50))
      },
      BENCH_OPTIONS,
    )

    bench(
      "deep-chain depth=500 (~500 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createDeepChain(500))
      },
      BENCH_OPTIONS,
    )

    bench(
      "mixed 10×100 nest=5 (~1660 nodes)",
      () => {
        testEnvWithEngine(flexilyEngine, () => createMixed(10, 100, 5))
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

    bench(
      "15 cols × 200 cards (~3015 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createLargeBoard(15, 200))
      },
      BENCH_OPTIONS,
    )

    bench(
      "20 cols × 250 cards (~5020 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createLargeBoard(20, 250))
      },
      BENCH_OPTIONS,
    )

    bench(
      "25 cols × 400 cards (~10025 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createLargeBoard(25, 400))
      },
      BENCH_OPTIONS,
    )

    bench(
      "30 cols × 500 cards (~15030 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createLargeBoard(30, 500))
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

  describe("Board Layout [yoga] - Shapes", () => {
    bench(
      "wide-flat 100×50 (~5050 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createWideFlat(100, 50))
      },
      BENCH_OPTIONS,
    )

    bench(
      "deep-chain depth=500 (~500 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createDeepChain(500))
      },
      BENCH_OPTIONS,
    )

    bench(
      "mixed 10×100 nest=5 (~1660 nodes)",
      () => {
        testEnvWithEngine(yogaEngine, () => createMixed(10, 100, 5))
      },
      BENCH_OPTIONS,
    )
  })
}

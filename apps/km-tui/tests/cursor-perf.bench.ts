/**
 * Cursor Navigation Performance Benchmark
 *
 * Targets the O(N) findIndex bottleneck in view-navigation.ts getSibling().
 * With /tmp/vt vault dirs (~3700 siblings), every j/k press scans the full array.
 *
 * Run: bun bench apps/km-tui/tests/cursor-perf.bench.ts
 */

import { bench, describe } from "vitest"
import { createFakeRepo, type Repo } from "@km/storage"
import { item, testEnv } from "./helpers/board-test.ts"
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
  function getSiblingViaFindIndex(
    repo: Repo,
    nodeId: string,
    delta: 1 | -1,
  ): string | null {
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
  for (const n of [100, 500, 1000, 2000, 3700]) {
    bench(
      `${n} cards — 20 j-presses`,
      () => {
        const { board } = testEnv(() => largeColumnFixture(n), {
          columns: 200,
          rows: 60,
        })
        for (let i = 0; i < 20; i++) board.press("j")
      },
      { iterations: 5, warmupIterations: 2 },
    )
  }
})

describe("Full pipeline: j-press on large column (400x200)", () => {
  for (const n of [500, 2000, 3700]) {
    bench(
      `${n} cards — 20 j-presses`,
      () => {
        const { board } = testEnv(() => largeColumnFixture(n), {
          columns: 400,
          rows: 200,
        })
        for (let i = 0; i < 20; i++) board.press("j")
      },
      { iterations: 5, warmupIterations: 2 },
    )
  }
})

describe("Full pipeline: h/l on multi-column (3 cols × 1000)", () => {
  bench(
    "navigate right across columns",
    () => {
      const { board } = testEnv(() => multiColumnFixture(3, 1000), {
        columns: 200,
        rows: 60,
      })
      // Move down into cards then across columns
      for (let i = 0; i < 5; i++) board.press("j")
      for (let i = 0; i < 2; i++) board.press("l")
    },
    { iterations: 5, warmupIterations: 2 },
  )
})

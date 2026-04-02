/**
 * ViewNodeColumnCache — Standalone Benchmark
 *
 * Direct performance measurement using performance.now() to avoid vitest bench
 * display issues. Run with: cd ~/Code/pim/km ; bun benchmarks/viewnode-cache-standalone.ts
 */

import { createFakeRepo } from "@km/storage"
import type { FakeRepo } from "@km/storage"
import {
  buildViewTree,
  type ViewNodeColumnCache,
  type ViewTreeRepo,
} from "@km/board"
import type { KNode } from "@km/core"

// ============================================================================
// Stable-ref repo wrapper (simulates real repo childrenCache)
// ============================================================================

function createStableRefRepo(repo: FakeRepo): ViewTreeRepo & { bustCache(): void; bustOne(id: string): void } {
  const cache = new Map<string, { version: number; children: KNode[] }>()
  let currentVersion = 0

  return {
    getNode(id: string) {
      return repo.getNode(id)
    },
    getChildren(parentId: string | null) {
      const key = parentId ?? "__null__"
      const entry = cache.get(key)
      if (entry && entry.version === currentVersion) {
        return entry.children
      }
      const children = repo.getChildren(parentId)
      cache.set(key, { version: currentVersion, children })
      return children
    },
    getNodesBatch(ids: string[]) {
      return repo.getNodesBatch(ids)
    },
    bustCache() {
      currentVersion++
    },
    bustOne(id: string) {
      cache.delete(id)
    },
  }
}

// ============================================================================
// Node builder
// ============================================================================

function makeNode(
  id: string,
  parentId: string | null,
  idx: number,
  type: "h" | "p" = "h",
  opts: Partial<KNode> = {},
): KNode {
  const now = Date.now()
  return {
    id,
    type,
    item: {},
    fstype: type === "h" ? "mdsection" : undefined,
    parent_id: parentId,
    parent_idx: idx,
    content: opts.content ?? `Node ${id}`,
    title: opts.title,
    name: opts.name,
    data: {},
    created_at: now,
    updated_at: now,
    version: "v0",
    ...opts,
  }
}

interface BoardSetup {
  repo: FakeRepo
  stableRepo: ReturnType<typeof createStableRefRepo>
  rootId: string
  columnCount: number
  cardsPerColumn: number
  subitemsPerCard: number
  totalNodes: number
}

function createBoard(columnCount: number, cardsPerColumn: number, subitemsPerCard = 0): BoardSetup {
  const nodes: KNode[] = []
  const rootId = "root"
  nodes.push(makeNode(rootId, null, 0, "h", { fstype: "mdsection", name: "Board" }))

  for (let c = 0; c < columnCount; c++) {
    const colId = `col-${c}`
    nodes.push(makeNode(colId, rootId, c, "h", {
      content: `Column ${c}`,
      name: `Column ${c}`,
    }))

    for (let card = 0; card < cardsPerColumn; card++) {
      const cardId = `card-${c}-${card}`
      nodes.push(makeNode(cardId, colId, card, "p", {
        content: `Card ${c}-${card}`,
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      }))

      for (let sub = 0; sub < subitemsPerCard; sub++) {
        const subId = `sub-${c}-${card}-${sub}`
        nodes.push(makeNode(subId, cardId, sub, "p", {
          content: `Sub ${c}-${card}-${sub}`,
          item: { list: "-" },
        }))
      }
    }
  }

  const repo = createFakeRepo({ nodes })
  const stableRepo = createStableRefRepo(repo)
  const totalNodes = nodes.length

  return { repo, stableRepo, rootId, columnCount, cardsPerColumn, subitemsPerCard, totalNodes }
}

// ============================================================================
// Benchmark runner
// ============================================================================

function benchmark(name: string, fn: () => void, warmupIterations = 100, iterations = 1000): {
  name: string
  meanMs: number
  medianMs: number
  p95Ms: number
  minMs: number
  maxMs: number
  opsPerSec: number
} {
  // Warmup
  for (let i = 0; i < warmupIterations; i++) fn()

  // Collect samples
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }

  samples.sort((a, b) => a - b)
  const sum = samples.reduce((a, b) => a + b, 0)
  const meanMs = sum / samples.length
  const medianMs = samples[Math.floor(samples.length / 2)]!
  const p95Ms = samples[Math.floor(samples.length * 0.95)]!
  const minMs = samples[0]!
  const maxMs = samples[samples.length - 1]!
  const opsPerSec = 1000 / meanMs

  return { name, meanMs, medianMs, p95Ms, minMs, maxMs, opsPerSec }
}

function printResult(r: ReturnType<typeof benchmark>) {
  console.log(
    `  ${r.name.padEnd(55)} mean=${r.meanMs.toFixed(4)}ms  median=${r.medianMs.toFixed(4)}ms  p95=${r.p95Ms.toFixed(4)}ms  min=${r.minMs.toFixed(4)}ms  ops/s=${r.opsPerSec.toFixed(0)}`,
  )
}

function printSeparator(title: string) {
  console.log(`\n${"=".repeat(120)}`)
  console.log(`  ${title}`)
  console.log("=".repeat(120))
}

// ============================================================================
// Run benchmarks
// ============================================================================

const foldDepths = new Map<string, number>()

const boards = [
  { label: "small",  ...createBoard(3, 10, 0) },
  { label: "medium", ...createBoard(5, 50, 0) },
  { label: "large",  ...createBoard(10, 100, 0) },
  { label: "xlarge", ...createBoard(10, 100, 3) },
]

// ---- Suite 1: Cache vs No Cache ----
printSeparator("SUITE 1: Cache vs No Cache across board sizes")

for (const board of boards) {
  console.log(`\n  Board: ${board.label} (${board.columnCount} cols x ${board.cardsPerColumn} cards x ${board.subitemsPerCard} subs = ${board.totalNodes} nodes)`)
  console.log("  " + "-".repeat(116))

  const noCache = benchmark(
    "no cache (fresh build)",
    () => { buildViewTree(board.stableRepo, board.rootId, foldDepths, undefined) },
  )
  printResult(noCache)

  const coldCache = benchmark(
    "with cache — cold (new Map each call)",
    () => {
      const cache: ViewNodeColumnCache = new Map()
      buildViewTree(board.stableRepo, board.rootId, foldDepths, cache)
    },
  )
  printResult(coldCache)

  // For warm cache: prime once, then benchmark repeated calls
  const warmCacheObj: ViewNodeColumnCache = new Map()
  buildViewTree(board.stableRepo, board.rootId, foldDepths, warmCacheObj)
  const warmCache = benchmark(
    "with cache — warm (all hits)",
    () => { buildViewTree(board.stableRepo, board.rootId, foldDepths, warmCacheObj) },
  )
  printResult(warmCache)

  const speedup = noCache.meanMs / warmCache.meanMs
  const savedMs = noCache.meanMs - warmCache.meanMs
  console.log(`\n  => Cache speedup: ${speedup.toFixed(2)}x  (saves ${savedMs.toFixed(4)}ms per call)`)
}

// ---- Suite 2: Sequential builds (amortized cache benefit) ----
printSeparator("SUITE 2: 10 sequential builds on large board (3011 nodes)")

const seqBoard = createBoard(10, 100, 2)

const seqNoCache = benchmark(
  "10 builds — no cache",
  () => {
    for (let i = 0; i < 10; i++)
      buildViewTree(seqBoard.stableRepo, seqBoard.rootId, foldDepths, undefined)
  },
  50,
  200,
)
printResult(seqNoCache)

const seqWarmCache = benchmark(
  "10 builds — warm cache (all hits after first)",
  () => {
    const cache: ViewNodeColumnCache = new Map()
    for (let i = 0; i < 10; i++)
      buildViewTree(seqBoard.stableRepo, seqBoard.rootId, foldDepths, cache)
  },
  50,
  200,
)
printResult(seqWarmCache)

const seqBusted = benchmark(
  "10 builds — cache busted each iteration",
  () => {
    const cache: ViewNodeColumnCache = new Map()
    for (let i = 0; i < 10; i++) {
      seqBoard.stableRepo.bustCache()
      buildViewTree(seqBoard.stableRepo, seqBoard.rootId, foldDepths, cache)
    }
  },
  50,
  200,
)
printResult(seqBusted)

console.log(`\n  => 10-build speedup with warm cache: ${(seqNoCache.meanMs / seqWarmCache.meanMs).toFixed(2)}x`)

// ---- Suite 3: Partial invalidation ----
printSeparator("SUITE 3: Partial invalidation (1 column changed, rest cached)")

const partialBoard = createBoard(10, 50)

const fullRebuild = benchmark(
  "full rebuild (no cache)",
  () => { buildViewTree(partialBoard.stableRepo, partialBoard.rootId, foldDepths, undefined) },
)
printResult(fullRebuild)

const partialCache: ViewNodeColumnCache = new Map()
buildViewTree(partialBoard.stableRepo, partialBoard.rootId, foldDepths, partialCache)

const partialInvalidation = benchmark(
  "1 col changed, 9 cached",
  () => {
    // Force miss on col-0 only
    const entry = partialCache.get("col-0")
    if (entry) {
      partialCache.set("col-0", { ...entry, childrenRef: [] })
    }
    buildViewTree(partialBoard.stableRepo, partialBoard.rootId, foldDepths, partialCache)
  },
)
printResult(partialInvalidation)

console.log(`\n  => Partial invalidation speedup: ${(fullRebuild.meanMs / partialInvalidation.meanMs).toFixed(2)}x`)

// ---- Suite 4: Absolute timing context ----
printSeparator("SUITE 4: Absolute timing context — single call")

for (const board of boards) {
  const r = benchmark(
    `single buildViewTree (${board.label}, ${board.totalNodes} nodes)`,
    () => { buildViewTree(board.stableRepo, board.rootId, foldDepths, undefined) },
    200,
    2000,
  )
  printResult(r)
}

// ---- Suite 5: Instrumented breakdown ----
printSeparator("SUITE 5: Time breakdown — where does buildViewTree spend time?")

// Instrument by timing getChildren calls (the main cost for FakeRepo)
{
  const board = createBoard(10, 100, 2) // 3011 nodes
  let getChildrenCalls = 0
  let getChildrenTimeNs = 0
  let getNodeCalls = 0
  let getNodesBatchCalls = 0

  const instrumentedRepo: ViewTreeRepo = {
    getNode(id: string) {
      getNodeCalls++
      return board.repo.getNode(id)
    },
    getChildren(parentId: string | null) {
      getChildrenCalls++
      const start = performance.now()
      const result = board.repo.getChildren(parentId)
      getChildrenTimeNs += (performance.now() - start)
      return result
    },
    getNodesBatch(ids: string[]) {
      getNodesBatchCalls++
      return board.repo.getNodesBatch(ids)
    },
  }

  // Run once uncached
  getChildrenCalls = 0
  getChildrenTimeNs = 0
  getNodeCalls = 0
  getNodesBatchCalls = 0

  const uncachedStart = performance.now()
  buildViewTree(instrumentedRepo, board.rootId, foldDepths, undefined)
  const uncachedTotal = performance.now() - uncachedStart

  console.log(`\n  Uncached build (10 cols x 100 cards x 2 subs = 3011 nodes):`)
  console.log(`    Total:             ${uncachedTotal.toFixed(4)}ms`)
  console.log(`    getChildren calls: ${getChildrenCalls}  (${getChildrenTimeNs.toFixed(4)}ms = ${(getChildrenTimeNs / uncachedTotal * 100).toFixed(1)}% of total)`)
  console.log(`    getNode calls:     ${getNodeCalls}`)
  console.log(`    getNodesBatch:     ${getNodesBatchCalls}`)

  // Run with warm cache
  const stableInstrumented: ViewTreeRepo = {
    getNode(id: string) {
      getNodeCalls++
      return board.stableRepo.getNode(id)
    },
    getChildren(parentId: string | null) {
      getChildrenCalls++
      const start = performance.now()
      const result = board.stableRepo.getChildren(parentId)
      getChildrenTimeNs += (performance.now() - start)
      return result
    },
    getNodesBatch(ids: string[]) {
      getNodesBatchCalls++
      return board.stableRepo.getNodesBatch(ids)
    },
  }

  // Prime cache
  const vnCache: ViewNodeColumnCache = new Map()
  buildViewTree(stableInstrumented, board.rootId, foldDepths, vnCache)

  // Reset counters
  getChildrenCalls = 0
  getChildrenTimeNs = 0
  getNodeCalls = 0
  getNodesBatchCalls = 0

  const cachedStart = performance.now()
  buildViewTree(stableInstrumented, board.rootId, foldDepths, vnCache)
  const cachedTotal = performance.now() - cachedStart

  console.log(`\n  Cached build (warm — all 10 columns hit):`)
  console.log(`    Total:             ${cachedTotal.toFixed(4)}ms`)
  console.log(`    getChildren calls: ${getChildrenCalls}  (${getChildrenTimeNs.toFixed(4)}ms = ${cachedTotal > 0 ? (getChildrenTimeNs / cachedTotal * 100).toFixed(1) : 0}% of total)`)
  console.log(`    getNode calls:     ${getNodeCalls}`)
  console.log(`    getNodesBatch:     ${getNodesBatchCalls}`)

  console.log(`\n  => getChildren calls saved by cache: ${1010 - getChildrenCalls} (uncached uses ~1010+ calls for 3011 node tree)`)
}

// ---- Summary ----
printSeparator("SUMMARY & RECOMMENDATION")

console.log(`
  Key findings:

  1. The cache operates at the COLUMN level — it skips rebuilding an entire column's
     ViewNode subtree when the column's children array reference hasn't changed.

  2. On a warm cache hit, the cache saves the cost of:
     - All getChildren() calls for cards within each column
     - All buildCardNode / buildSubitemNode work per column
     - parseHeadingRules for each column

  3. The cache check itself is O(1) per column: one Map.get + one reference comparison.

  4. The numbers above show whether the absolute time saved justifies the cache complexity
     and the known bug (grandchild content changes don't bust the cache).

  Decision framework:
     < 0.5ms saved per call on large board → DELETE the cache (complexity not worth it)
     0.5-2ms saved → BORDERLINE (fix or delete depending on correctness cost)
     > 2ms saved   → KEEP and fix the invalidation bug
`)

// Cleanup
for (const b of boards) b.repo.close()
seqBoard.repo.close()
partialBoard.repo.close()

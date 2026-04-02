/**
 * ViewNodeColumnCache — Real-world Cost Analysis
 *
 * Measures buildViewTree cost with pre-cached getChildren (simulating SQLite's
 * cached query results) to isolate the tree-building cost from the repo cost.
 *
 * Run: cd ~/Code/pim/km ; bun benchmarks/viewnode-cache-realworld.ts
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
// Pre-cached repo: all getChildren results are pre-computed O(1) Maps
// This simulates what the real repo does (SQLite prepared statements + caching)
// ============================================================================

function createPreCachedRepo(repo: FakeRepo): ViewTreeRepo & { getChildrenCallCount: number; resetCounters(): void } {
  // Pre-compute all children arrays and cache them by parent_id
  const childrenMap = new Map<string, KNode[]>()
  const allNodes = repo.getAllNodes()

  // Group by parent_id
  const byParent = new Map<string, KNode[]>()
  for (const node of allNodes) {
    const pid = node.parent_id ?? "__null__"
    const list = byParent.get(pid) ?? []
    list.push(node)
    byParent.set(pid, list)
  }
  for (const [key, nodes] of byParent) {
    nodes.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    childrenMap.set(key, nodes)
  }

  let getChildrenCallCount = 0

  return {
    get getChildrenCallCount() { return getChildrenCallCount },
    resetCounters() { getChildrenCallCount = 0 },
    getNode(id: string) {
      return repo.getNode(id)
    },
    getChildren(parentId: string | null) {
      getChildrenCallCount++
      const key = parentId ?? "__null__"
      return childrenMap.get(key) ?? []
    },
    getNodesBatch(ids: string[]) {
      return repo.getNodesBatch(ids)
    },
  }
}

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

function createBoard(columnCount: number, cardsPerColumn: number, subitemsPerCard = 0) {
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
  const preCachedRepo = createPreCachedRepo(repo)
  return { repo, preCachedRepo, rootId, totalNodes: nodes.length, columnCount, cardsPerColumn, subitemsPerCard }
}

// ============================================================================
// Benchmark runner
// ============================================================================

function benchmark(name: string, fn: () => void, warmup = 500, iterations = 5000) {
  for (let i = 0; i < warmup; i++) fn()

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

  console.log(
    `  ${name.padEnd(60)} mean=${meanMs.toFixed(4)}ms  median=${medianMs.toFixed(4)}ms  p95=${p95Ms.toFixed(4)}ms`,
  )
  return meanMs
}

// ============================================================================
// Run
// ============================================================================

const foldDepths = new Map<string, number>()

console.log("=" .repeat(120))
console.log("  ViewNodeColumnCache — Real-world Cost (O(1) getChildren)")
console.log("  This isolates tree-building cost from repo query cost.")
console.log("=" .repeat(120))

const configs = [
  { cols: 3, cards: 10, subs: 0, label: "small" },
  { cols: 5, cards: 50, subs: 0, label: "medium" },
  { cols: 10, cards: 100, subs: 0, label: "large" },
  { cols: 10, cards: 100, subs: 3, label: "xlarge" },
  { cols: 20, cards: 200, subs: 2, label: "huge" },
]

for (const cfg of configs) {
  const board = createBoard(cfg.cols, cfg.cards, cfg.subs)
  console.log(`\n  Board: ${cfg.label} (${cfg.cols} cols x ${cfg.cards} cards x ${cfg.subs} subs = ${board.totalNodes} nodes)`)
  console.log("  " + "-".repeat(116))

  const noCacheMean = benchmark(
    "no cache",
    () => { buildViewTree(board.preCachedRepo, board.rootId, foldDepths, undefined) },
  )

  // Warm cache test: prime once, measure repeated hits
  const warmCache: ViewNodeColumnCache = new Map()
  buildViewTree(board.preCachedRepo, board.rootId, foldDepths, warmCache)
  const warmMean = benchmark(
    "warm cache (all hits)",
    () => { buildViewTree(board.preCachedRepo, board.rootId, foldDepths, warmCache) },
  )

  const speedup = noCacheMean / warmMean
  const savedMs = noCacheMean - warmMean
  console.log(`  => speedup: ${speedup.toFixed(1)}x   saved: ${savedMs.toFixed(4)}ms   (${savedMs < 0.5 ? "DELETE" : savedMs < 2 ? "BORDERLINE" : "KEEP"})`)

  board.repo.close()
}

// ============================================================================
// Instrumented cost breakdown with pre-cached repo
// ============================================================================

console.log("\n" + "=" .repeat(120))
console.log("  Cost Breakdown — Pre-cached repo (large board, 1011 nodes)")
console.log("=" .repeat(120))

{
  const board = createBoard(10, 100, 0)

  // Count calls
  board.preCachedRepo.resetCounters()
  const start = performance.now()
  const tree = buildViewTree(board.preCachedRepo, board.rootId, foldDepths, undefined)
  const totalMs = performance.now() - start

  console.log(`\n  Uncached single build:`)
  console.log(`    Total time:        ${totalMs.toFixed(4)}ms`)
  console.log(`    getChildren calls: ${board.preCachedRepo.getChildrenCallCount}`)

  // Count ViewNodes produced
  let nodeCount = 0
  function countNodes(n: { children: any[] }) { nodeCount++; for (const c of n.children) countNodes(c) }
  countNodes(tree)
  console.log(`    ViewNodes built:   ${nodeCount}`)
  console.log(`    us per ViewNode:   ${((totalMs * 1000) / nodeCount).toFixed(2)}us`)

  // Warm cached
  const cache: ViewNodeColumnCache = new Map()
  buildViewTree(board.preCachedRepo, board.rootId, foldDepths, cache)
  board.preCachedRepo.resetCounters()
  const cStart = performance.now()
  buildViewTree(board.preCachedRepo, board.rootId, foldDepths, cache)
  const cTotalMs = performance.now() - cStart

  console.log(`\n  Cached single build (warm):`)
  console.log(`    Total time:        ${cTotalMs.toFixed(4)}ms`)
  console.log(`    getChildren calls: ${board.preCachedRepo.getChildrenCallCount}`)

  board.repo.close()
}

// ============================================================================
// Real-world scenario: 60fps render loop
// ============================================================================

console.log("\n" + "=" .repeat(120))
console.log("  Real-world Impact: 60fps render budget")
console.log("=" .repeat(120))

{
  const board = createBoard(10, 100, 3) // xlarge
  const frameBudgetMs = 16.67

  const noCacheTime = (() => {
    const times: number[] = []
    for (let i = 0; i < 1000; i++) {
      const s = performance.now()
      buildViewTree(board.preCachedRepo, board.rootId, foldDepths, undefined)
      times.push(performance.now() - s)
    }
    return times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!
  })()

  const cache: ViewNodeColumnCache = new Map()
  buildViewTree(board.preCachedRepo, board.rootId, foldDepths, cache)
  const cachedTime = (() => {
    const times: number[] = []
    for (let i = 0; i < 1000; i++) {
      const s = performance.now()
      buildViewTree(board.preCachedRepo, board.rootId, foldDepths, cache)
      times.push(performance.now() - s)
    }
    return times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!
  })()

  console.log(`\n  xlarge board (4011 nodes), O(1) getChildren:`)
  console.log(`    No cache median:  ${noCacheTime.toFixed(4)}ms  (${(noCacheTime / frameBudgetMs * 100).toFixed(1)}% of 16.67ms frame budget)`)
  console.log(`    Cached median:    ${cachedTime.toFixed(4)}ms  (${(cachedTime / frameBudgetMs * 100).toFixed(1)}% of 16.67ms frame budget)`)
  console.log(`    Frame budget saved: ${((noCacheTime - cachedTime) / frameBudgetMs * 100).toFixed(1)}%`)

  board.repo.close()
}

console.log("\n" + "=" .repeat(120))
console.log("  CONCLUSION")
console.log("=" .repeat(120))
console.log(`
  The benchmark measures buildViewTree with O(1) getChildren (pre-cached Map),
  isolating the tree-building cost from repo query overhead.

  The numbers above directly answer: is the ViewNodeColumnCache worth keeping?
`)

/**
 * Cursor Move Profiling — captures per-phase pipeline timing on real vault.
 *
 * Measures WALL-CLOCK time around board.press() AND per-phase pipeline timing.
 * board.press() includes: handleKey → React reconcile → render pipeline (×2 calls).
 *
 * Run: bun vitest run apps/km-tui/tests/cursor-profile.test.ts
 */

import { test, expect, beforeAll } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { testEnvWithRepo } from "./helpers/board-test.ts"

// Disable INKX_STRICT for profiling — the fresh render comparison
// overwrites __inkx_content_detail and __inkx_last_pipeline
beforeAll(() => {
  delete process.env.INKX_STRICT
  delete process.env.INKX_CHECK_INCREMENTAL
})

const VAULT_PATH = "/tmp/vt"

interface PipelineTiming {
  measure: number
  layout: number
  scroll: number
  screenRect: number
  notify: number
  content: number
  output: number
  total: number
}

function getLastPipeline(): PipelineTiming | null {
  return (globalThis as any).__inkx_last_pipeline ?? null
}

function clearContentAll(): void {
  ;(globalThis as any).__inkx_content_all = []
}

function getContentAll(): any[] {
  return ((globalThis as any).__inkx_content_all as any[]) ?? []
}

test("profile cursor move phases at 300x120", () => {
  const repo: Repo = runGenerator(
    createRepo(VAULT_PATH, { loadFiles: true }),
  )

  const { board } = testEnvWithRepo(repo, ".", {
    columns: 300,
    rows: 120,
    viewMode: "columns",
    incremental: true,
  })

  // Stay in root column — root has ~20 children, enough room for 12 j-presses
  // Warm up (2 presses to warm JIT)
  board.press("j")
  board.press("j")

  // Verify cursor is moving
  const textBefore = board.q("[data-cursor]").textContent()

  // Measure 10 cursor moves with wall-clock and pipeline timing
  interface Sample {
    wallMs: number
    cursor: string
    pipeline: PipelineTiming
    contentCalls: any[]
  }
  const samples: Sample[] = []

  for (let i = 0; i < 10; i++) {
    clearContentAll()
    const t0 = performance.now()
    board.press("j")
    const wallMs = performance.now() - t0
    const cursor = board.q("[data-cursor]").textContent()
    const pipeline = getLastPipeline()
    const contentCalls = getContentAll().map((c) => ({ ...c }))
    if (pipeline) {
      samples.push({ wallMs, cursor, pipeline: { ...pipeline }, contentCalls })
    }
  }

  // Verify cursor actually moved
  const textAfter = board.q("[data-cursor]").textContent()
  const moved = samples.filter(
    (s, i) => i === 0 ? s.cursor !== textBefore : s.cursor !== samples[i - 1]!.cursor,
  ).length
  console.log(`\nCursor moved ${moved}/10 times (before="${textBefore?.slice(0, 30)}" after="${textAfter?.slice(0, 30)}")`)
  expect(moved).toBeGreaterThan(0)

  // Print per-press breakdown
  console.log("\n=== Per-Press Timing (300x120, real vault) ===")
  console.log("  press | wall   | pipeline | measure | layout | scroll | notify | content | output | renders | cursor")
  console.log("  ------|--------|----------|---------|--------|--------|--------|---------|--------|---------|-------")
  for (const [i, s] of samples.entries()) {
    const p = s.pipeline
    const nCalls = s.contentCalls.length
    console.log(
      `  j[${i.toString().padStart(2)}] | ${s.wallMs.toFixed(1).padStart(5)}ms | ${p.total.toFixed(1).padStart(7)}ms | ${p.measure.toFixed(1).padStart(6)}ms | ${p.layout.toFixed(1).padStart(5)}ms | ${p.scroll.toFixed(1).padStart(5)}ms | ${p.notify.toFixed(1).padStart(5)}ms | ${p.content.toFixed(1).padStart(6)}ms | ${p.output.toFixed(1).padStart(5)}ms | ${nCalls.toString().padStart(7)} | ${s.cursor.slice(0, 25)}`,
    )
  }

  // Averages
  const avg = (fn: (s: Sample) => number) =>
    (samples.reduce((sum, s) => sum + fn(s), 0) / samples.length).toFixed(1)
  console.log(
    `\n  AVG:  wall=${avg((s) => s.wallMs)}ms  pipeline=${avg((s) => s.pipeline.total)}ms  measure=${avg((s) => s.pipeline.measure)}ms  layout=${avg((s) => s.pipeline.layout)}ms  content=${avg((s) => s.pipeline.content)}ms  output=${avg((s) => s.pipeline.output)}ms`,
  )

  // Content phase detail for first moving press
  const firstMove = samples.find(
    (s, i) => i === 0 ? s.cursor !== textBefore : s.cursor !== samples[i - 1]!.cursor,
  )
  if (firstMove && firstMove.contentCalls.length > 0) {
    console.log("\n  Content calls for first cursor move:")
    for (const [j, c] of firstMove.contentCalls.entries()) {
      console.log(
        `    call[${j}]: visited=${c.nodesVisited} rendered=${c.nodesRendered} skipped=${c.nodesSkipped} clone=${c.clone?.toFixed(1)}ms render=${c.render?.toFixed(1)}ms`,
      )
    }
  }
})

test("profile cursor move phases at 80x24", () => {
  const repo: Repo = runGenerator(
    createRepo(VAULT_PATH, { loadFiles: true }),
  )

  const { board } = testEnvWithRepo(repo, ".", {
    columns: 80,
    rows: 24,
    viewMode: "columns",
    incremental: true,
  })

  // Warm up
  board.press("j")
  board.press("j")

  const textBefore = board.q("[data-cursor]").textContent()

  interface Sample {
    wallMs: number
    cursor: string
    pipeline: PipelineTiming
  }
  const samples: Sample[] = []

  for (let i = 0; i < 10; i++) {
    const t0 = performance.now()
    board.press("j")
    const wallMs = performance.now() - t0
    const cursor = board.q("[data-cursor]").textContent()
    const pipeline = getLastPipeline()
    if (pipeline) {
      samples.push({ wallMs, cursor, pipeline: { ...pipeline } })
    }
  }

  const textAfter = board.q("[data-cursor]").textContent()
  console.log(`\nCursor moved (before="${textBefore?.slice(0, 30)}" after="${textAfter?.slice(0, 30)}")`)

  console.log("\n=== Per-Press Timing (80x24, real vault) ===")
  for (const [i, s] of samples.entries()) {
    const p = s.pipeline
    console.log(
      `  j[${i}]: wall=${s.wallMs.toFixed(1)}ms  pipeline=${p.total.toFixed(1)}ms  measure=${p.measure.toFixed(1)}ms  layout=${p.layout.toFixed(1)}ms  content=${p.content.toFixed(1)}ms  output=${p.output.toFixed(1)}ms  cursor="${s.cursor.slice(0, 25)}"`,
    )
  }

  const avg = (fn: (s: Sample) => number) =>
    (samples.reduce((sum, s) => sum + fn(s), 0) / samples.length).toFixed(1)
  console.log(
    `\n  AVG:  wall=${avg((s) => s.wallMs)}ms  pipeline=${avg((s) => s.pipeline.total)}ms  layout=${avg((s) => s.pipeline.layout)}ms  content=${avg((s) => s.pipeline.content)}ms`,
  )
})

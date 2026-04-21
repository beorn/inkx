#!/usr/bin/env bun
/**
 * Workload runner — measures critical paths against a synthetic vault
 * (or any directory of markdown files). All in-process — no PTY spawn
 * required for the storage-layer measurements.
 *
 * Cold-start is measured two ways:
 *   1. In-process "load-to-queryable": time to createRepo({ loadFiles: true })
 *      → first SQL query returns a row. This is what scale-architecture
 *      actually cares about (storage-layer cold path).
 *   2. Optional PTY cold-start via `bun km view <vault>` — handled by
 *      tools/measure-cold-start.ts (separate agent), not duplicated here.
 *
 * USAGE:
 *   bun tools/scale-bench/run-workload.ts <vaultDir> <label>
 *
 * Scope-guard: benchmark harness, not CI.
 */
import { utimesSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  createRepo,
  getNodeCount,
  getChildren,
  getBacklinksByHref,
  search,
} from "@km/storage"

// ----------------------------------------------------------------------------
// Metric capture
// ----------------------------------------------------------------------------
export interface Latencies {
  p50: number
  p95: number
  p99: number
  mean: number
  min: number
  max: number
  count: number
}

function summarize(samples: number[]): Latencies {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0, count: 0 }
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return {
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    mean,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    count: samples.length,
  }
}

function rssBytes(): number {
  return process.memoryUsage().rss
}

// ----------------------------------------------------------------------------
// File discovery (for touching files + counting size)
// ----------------------------------------------------------------------------
function listMarkdownFiles(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(full)
      } else if (name.endsWith(".md")) {
        out.push(full)
      }
    }
  }
  return out
}

function countBytes(files: string[]): number {
  let total = 0
  for (const f of files) {
    try {
      total += statSync(f).size
    } catch {
      // ignore
    }
  }
  return total
}

// ----------------------------------------------------------------------------
// Workload result type
// ----------------------------------------------------------------------------
export interface WorkloadResult {
  label: string
  vault: string
  fileCount: number
  totalBytes: number
  rssBaselineMB: number
  rssAfterLoadMB: number
  rssSteadyMB: number
  load: {
    loadMs: number
    nodeCount: number
    linkCount: number
    errors: number
  }
  navigation: Latencies // getChildren on random column ids
  backlinks: Latencies // getBacklinksByHref on popular targets
  search: Latencies // FTS5 search on common word
  reconcile: {
    touched: number
    durationMs: number
    changesApplied: number
  }
}

// ----------------------------------------------------------------------------
// Drive the createRepo generator to completion
// ----------------------------------------------------------------------------
function runGen<T, R>(gen: Generator<T, R, unknown>): R {
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

// ----------------------------------------------------------------------------
// Main workload runner
// ----------------------------------------------------------------------------
export async function runWorkload(vaultDir: string, label: string): Promise<WorkloadResult> {
  // Force GC between runs if exposed
  if (typeof Bun !== "undefined" && (Bun as unknown as { gc?: (sync: boolean) => void }).gc) {
    ;(Bun as unknown as { gc: (sync: boolean) => void }).gc(true)
  }

  const files = listMarkdownFiles(vaultDir)
  const totalBytes = countBytes(files)
  const rssBaseline = rssBytes()

  // -----------------------------------------------------------
  // 1. Cold load — createRepo with loadFiles: true (memory mode)
  // -----------------------------------------------------------
  const tLoad0 = performance.now()
  const repo = runGen(createRepo(vaultDir, { loadFiles: true, forceMemory: true }))
  const loadMs = performance.now() - tLoad0
  const rssAfterLoad = rssBytes()

  const db = repo.database
  const nodeCount = getNodeCount(db)

  // Link count: count the links table
  const linkCount = (db.query("SELECT COUNT(*) as c FROM links").get() as { c: number }).c

  // -----------------------------------------------------------
  // 2. Warm navigation — simulate 100 j/k via getChildren calls
  //    on random "column" nodes (h-type nodes under files).
  //    This is the hot query on j/k in the real TUI (board re-render
  //    hits getChildren+getBodyChildren repeatedly).
  // -----------------------------------------------------------
  // Sample candidate column ids: top-level headings (fstype = 'mdsection')
  const columnIds = (
    db
      .query("SELECT id FROM nodes WHERE type = 'h' AND fstype = 'mdsection' LIMIT 1000")
      .all() as Array<{ id: string }>
  ).map((r) => r.id)

  const navSamples: number[] = []
  for (let i = 0; i < 100; i++) {
    const id = columnIds[i % columnIds.length] ?? ""
    const t = performance.now()
    getChildren(db, id)
    navSamples.push(performance.now() - t)
  }

  // -----------------------------------------------------------
  // 3. Backlink query — popular targets (known hub pages)
  // -----------------------------------------------------------
  const popularHrefs = [
    "km:Project Alpha",
    "km:Product Roadmap",
    "km:Engineering Handbook",
    "km:Daily Dashboard",
    "km:Research Index",
    "km:Meeting Notes",
    "km:Open Questions",
    "km:Reading List",
  ]
  const backlinkSamples: number[] = []
  for (let i = 0; i < 50; i++) {
    const href = popularHrefs[i % popularHrefs.length]!
    const t = performance.now()
    getBacklinksByHref(db, href)
    backlinkSamples.push(performance.now() - t)
  }

  // -----------------------------------------------------------
  // 4. FTS5 search — common-ish word
  // -----------------------------------------------------------
  const searchTerms = ["pipeline", "signal", "vector", "node", "parse", "render"]
  const searchSamples: number[] = []
  for (let i = 0; i < 30; i++) {
    const term = searchTerms[i % searchTerms.length]!
    const t = performance.now()
    try {
      search(db, term, 50)
    } catch {
      // ignore — FTS5 may not be populated in pure memory mode; still measures round-trip
    }
    searchSamples.push(performance.now() - t)
  }

  // -----------------------------------------------------------
  // 5. External-edit reconcile — touch 10 files, call reconcileAsync
  // -----------------------------------------------------------
  const touchCount = Math.min(10, files.length)
  const touchFiles = files.slice(0, touchCount)
  const now = new Date()
  for (const f of touchFiles) {
    // Append a single space then trim; bump mtime deterministically
    try {
      const content = readFileSync(f, "utf-8")
      writeFileSync(f, content + " \n")
      utimesSync(f, now, now)
    } catch {
      // ignore
    }
  }

  const tReconcile0 = performance.now()
  const reconcileResult = await repo.reconcileAsync()
  const reconcileMs = performance.now() - tReconcile0

  // -----------------------------------------------------------
  // 6. Steady-state RSS: wait ~500ms + run small GC
  // -----------------------------------------------------------
  await new Promise((r) => setTimeout(r, 500))
  if (typeof Bun !== "undefined" && (Bun as unknown as { gc?: (sync: boolean) => void }).gc) {
    ;(Bun as unknown as { gc: (sync: boolean) => void }).gc(true)
  }
  const rssSteady = rssBytes()

  // Dispose the repo (generator is the owner)
  try {
    ;(repo as unknown as Disposable)[Symbol.dispose]?.()
  } catch {
    // ignore
  }

  return {
    label,
    vault: vaultDir,
    fileCount: files.length,
    totalBytes,
    rssBaselineMB: rssBaseline / 1024 / 1024,
    rssAfterLoadMB: rssAfterLoad / 1024 / 1024,
    rssSteadyMB: rssSteady / 1024 / 1024,
    load: {
      loadMs,
      nodeCount,
      linkCount,
      errors: repo.loadErrors.length,
    },
    navigation: summarize(navSamples),
    backlinks: summarize(backlinkSamples),
    search: summarize(searchSamples),
    reconcile: {
      touched: touchCount,
      durationMs: reconcileMs,
      changesApplied: reconcileResult.changes,
    },
  }
}

// CLI
if (import.meta.main) {
  const vaultDir = process.argv[2]
  const label = process.argv[3] ?? "run"
  if (!vaultDir) {
    console.error("usage: bun tools/scale-bench/run-workload.ts <vaultDir> <label>")
    process.exit(2)
  }
  const r = await runWorkload(vaultDir, label)
  console.log(JSON.stringify(r, null, 2))
}

#!/usr/bin/env bun
/**
 * Pretty-print the per-phase breakdown from `benchmarks/results/.last-phases.json`.
 *
 * Used by `scripts/bench-now.sh` after running vitest bench, to render a
 * profile-style breakdown alongside the raw vitest output.
 *
 * Run:
 *   bun scripts/bench-format-phases.ts
 *   bun scripts/bench-format-phases.ts --json
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

interface BenchPhases {
  measure: number
  layout: number
  scroll: number
  scrollRect: number
  notify: number
  layoutTotal: number
  content: number
  output: number
  total: number
  reconcile: number
  pipelineCalls: number
  renderCalls: number
}

interface BenchPhaseRecord {
  name: string
  iterations: number
  wallMs: number
  phases: BenchPhases
}

const repoRoot = resolve(import.meta.dirname, "..")
const sidecarPath = resolve(repoRoot, "benchmarks/results/.last-phases.json")

if (!existsSync(sidecarPath)) {
  console.error(`bench-format-phases: no data at ${sidecarPath}`)
  console.error("Run a bench harness with withBenchPhases() first.")
  process.exit(1)
}

const records = JSON.parse(readFileSync(sidecarPath, "utf8")) as BenchPhaseRecord[]
const args = process.argv.slice(2)

if (args.includes("--json")) {
  console.log(JSON.stringify(records, null, 2))
  process.exit(0)
}

// Human-readable summary
const pad = (s: string, n: number) => s.padEnd(n)
const fmt = (ms: number) => `${ms.toFixed(2).padStart(8)}ms`

for (const r of records) {
  const i = r.iterations || 1
  const wall = r.wallMs / i
  const phases = r.phases
  const layoutSide = phases.layoutTotal / i
  const measure = phases.measure / i
  const layout = phases.layout / i
  const content = phases.content / i
  const output = phases.output / i
  const reconcile = phases.reconcile / i
  const accounted = layoutSide + content + output + reconcile
  const other = Math.max(0, wall - accounted)
  const pct = (ms: number) => (wall === 0 ? "  0%" : `${((ms / wall) * 100).toFixed(0).padStart(3)}%`)

  console.log(`\n${pad(r.name, 36)}  iters=${i}  pipeline=${phases.pipelineCalls}`)
  console.log(`  ${pad("wall (per iter)", 22)}  ${fmt(wall)}`)
  console.log(`  ${pad("react reconcile", 22)}  ${fmt(reconcile)} (${pct(reconcile)})`)
  console.log(`  ${pad("layout side total", 22)}  ${fmt(layoutSide)} (${pct(layoutSide)})`)
  console.log(`  ${pad("  measure", 22)}  ${fmt(measure)}`)
  console.log(`  ${pad("  flexbox layout", 22)}  ${fmt(layout)}`)
  console.log(`  ${pad("content (render)", 22)}  ${fmt(content)} (${pct(content)})`)
  console.log(`  ${pad("output (diff/ANSI)", 22)}  ${fmt(output)} (${pct(output)})`)
  console.log(`  ${pad("other", 22)}  ${fmt(other)} (${pct(other)})`)
}

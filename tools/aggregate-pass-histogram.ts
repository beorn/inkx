#!/usr/bin/env bun
/**
 * aggregate-pass-histogram.ts — combine pass-cause JSONL records into a
 * single summary suitable for hub/silvery/design/pass-cause-histogram.md.
 *
 * Usage:
 *   bun tools/aggregate-pass-histogram.ts /tmp/silvery-pass-histogram-*.jsonl
 *
 * Tracking: km-silvery.renderer-feedback-trace
 */

import { readFileSync } from "node:fs"
import type { PassHistogram } from "../vendor/silvery/packages/ag-term/src/runtime/pass-cause"

interface AggregateState {
  totalRecords: number
  appInstances: number
  perCause: Map<
    string,
    {
      count: number
      edges: Map<string, number>
      nodes: Map<string, number>
    }
  >
  perPass: number[]
}

function ingest(state: AggregateState, h: PassHistogram): void {
  state.appInstances += 1
  state.totalRecords += h.totalRecords
  for (let i = 0; i < h.perPass.length; i++) {
    while (state.perPass.length <= i) state.perPass.push(0)
    state.perPass[i] = (state.perPass[i] ?? 0) + (h.perPass[i] ?? 0)
  }
  for (const entry of h.byCause) {
    let bucket = state.perCause.get(entry.cause)
    if (!bucket) {
      bucket = { count: 0, edges: new Map(), nodes: new Map() }
      state.perCause.set(entry.cause, bucket)
    }
    bucket.count += entry.count
    for (const e of entry.topEdges) {
      bucket.edges.set(e.edge, (bucket.edges.get(e.edge) ?? 0) + e.count)
    }
    for (const n of entry.topNodes) {
      const key = String(n.nodeId)
      bucket.nodes.set(key, (bucket.nodes.get(key) ?? 0) + n.count)
    }
  }
}

function format(state: AggregateState): string {
  const lines: string[] = []
  lines.push(`# Pass-Cause Histogram`)
  lines.push("")
  lines.push(
    `Aggregate over ${state.appInstances} app teardowns, ${state.totalRecords} extra-pass causes recorded.`,
  )
  lines.push("")
  if (state.perPass.length > 0) {
    lines.push("## Per-pass-index commits")
    lines.push("")
    lines.push("| Pass index | Commits |")
    lines.push("|---:|---:|")
    for (let i = 0; i < state.perPass.length; i++) {
      const c = state.perPass[i] ?? 0
      if (c > 0) lines.push(`| ${i} | ${c} |`)
    }
    lines.push("")
  } else {
    lines.push(
      "_No per-pass-index commits recorded — convergence loops stabilized in pass 0._",
    )
    lines.push("")
  }
  lines.push("## By cause")
  lines.push("")
  const sorted = [...state.perCause.entries()].sort((a, b) => b[1].count - a[1].count)
  if (sorted.length === 0) {
    lines.push("_No cause records captured._")
  } else {
    for (const [cause, bucket] of sorted) {
      const pct =
        state.totalRecords === 0
          ? "0.0"
          : ((bucket.count / state.totalRecords) * 100).toFixed(1)
      lines.push(`### ${cause} — ${bucket.count} (${pct}%)`)
      lines.push("")
      const topEdges = [...bucket.edges.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
      const topNodes = [...bucket.nodes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
      if (topEdges.length > 0) {
        lines.push("**Top edges:**")
        lines.push("")
        for (const [edge, count] of topEdges) lines.push(`- \`${edge}\` × ${count}`)
        lines.push("")
      }
      if (topNodes.length > 0) {
        lines.push("**Top nodes:**")
        lines.push("")
        for (const [node, count] of topNodes) lines.push(`- \`${node}\` × ${count}`)
        lines.push("")
      }
    }
  }
  return lines.join("\n")
}

function main(): void {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("usage: bun tools/aggregate-pass-histogram.ts <file1.jsonl> [file2.jsonl ...]")
    process.exit(2)
  }
  const state: AggregateState = {
    totalRecords: 0,
    appInstances: 0,
    perCause: new Map(),
    perPass: [],
  }
  for (const f of files) {
    const raw = readFileSync(f, "utf8")
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // Skip non-JSON lines (text-format histograms from older runs).
      if (!trimmed.startsWith("{")) continue
      try {
        const h = JSON.parse(trimmed) as PassHistogram
        ingest(state, h)
      } catch {
        // ignore malformed lines
      }
    }
  }
  process.stdout.write(format(state) + "\n")
}

main()

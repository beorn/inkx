/**
 * Perf Command - Performance Analysis Tools
 *
 * Analyzes span traces captured with TRACE=1 environment variable.
 *
 * Usage:
 *   TRACE=1 bun km view /tmp/vault 2> trace.jsonl
 *   bun km perf analyze trace.jsonl
 *   bun km perf analyze trace.jsonl --json
 */

import { readFileSync } from "node:fs"
import { Command, int } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)

/** Span entry from @beorn/logger TRACE output */
interface SpanEntry {
  level: string
  name: string
  duration: number
  parent?: string
  [key: string]: unknown
}

/** Computed statistics for a span name */
interface SpanStats {
  name: string
  count: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  p99: number
  total: number
}

interface AnalyzeOptions {
  json?: boolean
  sort?: string
  limit?: number
}

/**
 * Parse JSONL trace file and extract span entries
 */
function parseTraceFile(filePath: string): SpanEntry[] {
  const content = readFileSync(filePath, "utf-8")
  const lines = content.split("\n").filter(Boolean)

  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as SpanEntry
      } catch {
        return null
      }
    })
    .filter((entry): entry is SpanEntry => entry?.level === "span")
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0
}

/**
 * Group spans by name and calculate statistics
 */
function calculateStats(spans: SpanEntry[]): SpanStats[] {
  // Group by span name
  const byName = new Map<string, number[]>()
  for (const span of spans) {
    const durations = byName.get(span.name) || []
    durations.push(span.duration)
    byName.set(span.name, durations)
  }

  // Calculate stats for each span name
  const stats: SpanStats[] = []
  for (const [name, durations] of byName) {
    durations.sort((a, b) => a - b)
    const total = durations.reduce((a, b) => a + b, 0)
    stats.push({
      name,
      count: durations.length,
      min: durations[0] ?? 0,
      max: durations[durations.length - 1] ?? 0,
      avg: Math.round(total / durations.length),
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      total,
    })
  }

  return stats
}

/**
 * Format duration in human readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export const perfCommand = new Command("perf").description("Performance analysis tools")

perfCommand
  .command("analyze")
  .description("Analyze span traces from TRACE=1 output")
  .argument("<file>", "Path to trace file (JSONL format)")
  .option("--json", "Output as JSON")
  .option("--sort <field>", "Sort by field (avg, total, count, max, p95)", "total")
  .option("--limit <n>", "Limit output to top N spans", int)
  .action((file: string, options: AnalyzeOptions) => {
    // Parse trace file
    let spans: SpanEntry[]
    try {
      spans = parseTraceFile(file)
    } catch (err) {
      console.error(term.red(`Failed to read trace file: ${file}`))
      console.error(term.dim((err as Error).message))
      process.exit(1)
    }

    if (spans.length === 0) {
      console.error(term.yellow("No span entries found in trace file"))
      console.error(term.dim("Make sure to capture with TRACE=1 env var"))
      process.exit(1)
    }

    // Calculate statistics
    let stats = calculateStats(spans)

    // Sort by requested field
    const sortField = options.sort ?? "total"
    const sortKey = sortField as keyof SpanStats
    const firstStat = stats[0]
    if (firstStat && sortKey in firstStat) {
      stats.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (typeof aVal === "number" && typeof bVal === "number") {
          return bVal - aVal
        }
        return 0
      })
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      stats = stats.slice(0, options.limit)
    }

    // Output
    if (options.json) {
      console.log(JSON.stringify(stats, null, 2))
      return
    }

    // Human readable output
    console.log(term.bold("Performance Analysis"))
    console.log(term.dim(`${spans.length} span entries from ${file}\n`))

    // Find longest span name for alignment
    const maxNameLen = Math.min(40, Math.max(...stats.map((s) => s.name.length)))

    // Header
    console.log(
      term.dim(
        `${"Span".padEnd(maxNameLen)}  ${"Count".padStart(6)}  ${"Total".padStart(8)}  ${"Avg".padStart(8)}  ${"P95".padStart(8)}  ${"Max".padStart(8)}`,
      ),
    )
    console.log(term.dim("-".repeat(maxNameLen + 50)))

    for (const s of stats) {
      const name = s.name.length > maxNameLen ? `${s.name.slice(0, maxNameLen - 2)}..` : s.name.padEnd(maxNameLen)

      console.log(
        `${name}  ${String(s.count).padStart(6)}  ${formatDuration(s.total).padStart(8)}  ${formatDuration(s.avg).padStart(8)}  ${formatDuration(s.p95).padStart(8)}  ${formatDuration(s.max).padStart(8)}`,
      )
    }

    console.log()
    console.log(term.dim(`Sorted by: ${sortField}`))
  })

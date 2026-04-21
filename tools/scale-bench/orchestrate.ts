#!/usr/bin/env bun
/**
 * Orchestrator for the km-storage scale benchmark.
 *
 * Runs the generator + workload at each scale tier, aggregates results, and
 * writes both JSON and a human-readable markdown report.
 *
 * Tiers map to the bead km-storage.scale-benchmarks spec:
 *   1x  ≈ 10k files  — current user vault ballpark
 *   2x  ≈ 20k files  — kill-switch threshold
 *   5x  ≈ 50k files
 *   10x ≈ 100k files
 *
 * If generation of a tier exceeds --max-gen-seconds (default 300),
 * the orchestrator skips it and notes the cap in the report.
 *
 * USAGE:
 *   bun tools/scale-bench/orchestrate.ts [--tiers=1x,2x,5x,10x] [--skip-gen]
 *
 * Output:
 *   hub/km/scale-bench-results-YYYY-MM-DD.json
 *   hub/km/scale-bench-results-YYYY-MM-DD.md
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { generateVault } from "./generate-vault.ts"
import { runWorkload, type WorkloadResult } from "./run-workload.ts"

interface Tier {
  label: string
  fileCount: number
  vaultDir: string
}

const REPO_ROOT = dirname(dirname(dirname(new URL(import.meta.url).pathname)))

const DEFAULT_TIERS: Tier[] = [
  { label: "1x", fileCount: 10_000, vaultDir: "/tmp/km-bench-vault-1x" },
  { label: "2x", fileCount: 20_000, vaultDir: "/tmp/km-bench-vault-2x" },
  { label: "5x", fileCount: 50_000, vaultDir: "/tmp/km-bench-vault-5x" },
  { label: "10x", fileCount: 100_000, vaultDir: "/tmp/km-bench-vault-10x" },
]

interface TierResult {
  tier: string
  fileCount: number
  generation: {
    durationMs: number
    totalMB: number
    skipped?: string
  } | null
  workload: WorkloadResult | null
  error: string | null
}

interface BenchReport {
  runDate: string
  host: {
    platform: string
    arch: string
    memoryMB: number
    bunVersion: string
  }
  tiers: TierResult[]
  summary: {
    tiersCompleted: string[]
    tiersSkipped: string[]
    verdict: string
  }
}

function parseArgs(argv: string[]): { tiers: Tier[]; skipGen: boolean; maxGenSeconds: number } {
  let tiers = DEFAULT_TIERS
  let skipGen = false
  let maxGenSeconds = 300
  for (const arg of argv) {
    if (arg.startsWith("--tiers=")) {
      const labels = arg.slice("--tiers=".length).split(",")
      tiers = DEFAULT_TIERS.filter((t) => labels.includes(t.label))
    } else if (arg === "--skip-gen") {
      skipGen = true
    } else if (arg.startsWith("--max-gen-seconds=")) {
      maxGenSeconds = Number(arg.slice("--max-gen-seconds=".length))
    }
  }
  return { tiers, skipGen, maxGenSeconds }
}

function fmtMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function fmtMB(mb: number): string {
  return `${mb.toFixed(0)}MB`
}

function renderMarkdown(report: BenchReport): string {
  const { runDate, host, tiers, summary } = report
  const lines: string[] = []
  lines.push(`# km-storage scale benchmark — ${runDate}`)
  lines.push("")
  lines.push(`**Host**: ${host.platform} ${host.arch}, ${fmtMB(host.memoryMB)} RAM, Bun ${host.bunVersion}`)
  lines.push("")
  lines.push(`**Tiers completed**: ${summary.tiersCompleted.join(", ") || "(none)"}`)
  lines.push(`**Tiers skipped**: ${summary.tiersSkipped.join(", ") || "(none)"}`)
  lines.push("")
  lines.push(`## Verdict`)
  lines.push("")
  lines.push(summary.verdict)
  lines.push("")

  lines.push(`## Results table`)
  lines.push("")
  lines.push(
    "| tier | files | bytes | gen | load | nodes | RSS steady | nav p50/p95 | backlinks p50/p95 | reconcile(10) |",
  )
  lines.push(
    "|------|------:|------:|----:|-----:|------:|-----------:|------------:|------------------:|--------------:|",
  )

  for (const t of tiers) {
    if (t.error) {
      lines.push(`| ${t.tier} | ${t.fileCount} | — | error | — | — | — | — | — | — |`)
      continue
    }
    if (!t.workload) {
      lines.push(`| ${t.tier} | ${t.fileCount} | — | skipped | — | — | — | — | — | — |`)
      continue
    }
    const w = t.workload
    lines.push(
      `| ${t.tier} | ${w.fileCount} | ${(w.totalBytes / 1024 / 1024).toFixed(0)}MB | ` +
        `${t.generation ? fmtMs(t.generation.durationMs) : "—"} | ` +
        `${fmtMs(w.load.loadMs)} | ${w.load.nodeCount} | ` +
        `${fmtMB(w.rssSteadyMB)} | ` +
        `${fmtMs(w.navigation.p50)}/${fmtMs(w.navigation.p95)} | ` +
        `${fmtMs(w.backlinks.p50)}/${fmtMs(w.backlinks.p95)} | ` +
        `${fmtMs(w.reconcile.durationMs)} |`,
    )
  }

  lines.push("")
  lines.push(`## Per-tier detail`)
  lines.push("")
  for (const t of tiers) {
    lines.push(`### ${t.tier} — ${t.fileCount} files`)
    lines.push("")
    if (t.error) {
      lines.push(`Error: ${t.error}`)
      lines.push("")
      continue
    }
    if (!t.workload) {
      lines.push(`Skipped: ${t.generation?.skipped ?? "unknown"}`)
      lines.push("")
      continue
    }
    const w = t.workload
    lines.push(`- Generated vault: ${w.fileCount} files (${(w.totalBytes / 1024 / 1024).toFixed(1)} MB)`)
    lines.push(`- Generation time: ${t.generation ? fmtMs(t.generation.durationMs) : "—"}`)
    lines.push(
      `- Cold load (createRepo → queryable): ${fmtMs(w.load.loadMs)}, ` +
        `${w.load.nodeCount} nodes, ${w.load.linkCount} links, ${w.load.errors} errors`,
    )
    lines.push(
      `- RSS: baseline ${fmtMB(w.rssBaselineMB)} → after load ${fmtMB(w.rssAfterLoadMB)} → steady ${fmtMB(w.rssSteadyMB)}`,
    )
    lines.push(
      `- Navigation (getChildren x100): p50 ${fmtMs(w.navigation.p50)}, p95 ${fmtMs(w.navigation.p95)}, p99 ${fmtMs(w.navigation.p99)}`,
    )
    lines.push(
      `- Backlinks (getBacklinksByHref x50): p50 ${fmtMs(w.backlinks.p50)}, p95 ${fmtMs(w.backlinks.p95)}, p99 ${fmtMs(w.backlinks.p99)}`,
    )
    lines.push(
      `- FTS5 search (x30): p50 ${fmtMs(w.search.p50)}, p95 ${fmtMs(w.search.p95)}, p99 ${fmtMs(w.search.p99)}`,
    )
    lines.push(
      `- External-edit reconcile (10 files): ${fmtMs(w.reconcile.durationMs)}, ${w.reconcile.changesApplied} changes applied`,
    )
    lines.push("")
  }

  lines.push(`## Methodology`)
  lines.push("")
  lines.push(
    "- In-process measurement: `createRepo(..., { loadFiles: true, forceMemory: true })` driven to completion, then DB queries timed directly.",
  )
  lines.push("- Memory mode (no `.km/` directory) — measures parse + resolve + materialize path, which is the worst case.")
  lines.push(
    "- Not measured here: PTY cold-start (`bun km view`), React tree build, signal graph registration. That is `tools/measure-cold-start.ts`'s job.",
  )
  lines.push(
    "- Backlink query uses the fixed set of 'hub' target pages embedded by the vault generator (known popular targets).",
  )
  lines.push(
    "- Navigation measures `getChildren` on 100 randomly-sampled heading nodes — the hot query on j/k in the real TUI.",
  )
  lines.push("")
  lines.push(`## Limitations`)
  lines.push("")
  lines.push("- Synthetic content is shallower than real vaults; link density is uniform, not bursty.")
  lines.push("- Navigation measurement does not include React reconciler / flexily layout / silvery rendering cost.")
  lines.push("- Reconcile measurement touches files in sequence; real-world concurrent external edits not simulated.")
  lines.push(
    "- Search measurement times the call, but FTS5 index is populated in disk mode only — in memory mode it returns zero results instantly.",
  )
  lines.push("")

  return lines.join("\n")
}

function deriveVerdict(tiers: TierResult[]): string {
  const completed = tiers.filter((t) => t.workload)
  if (completed.length === 0) {
    return "No tiers completed — harness failure. Cannot make a scale-architecture determination."
  }

  const by = Object.fromEntries(completed.map((t) => [t.tier, t.workload!]))
  const t1 = by["1x"]
  const t2 = by["2x"]
  const t5 = by["5x"]
  const t10 = by["10x"]

  const hitCriteria: string[] = []
  const missCriteria: string[] = []

  // Kill-switch criteria from the epic:
  //   cold-start >1s OR frame drop >16ms on M5 Max after lazy-hydration lands.
  // In-process cold load is a floor for cold-start. If already >1s here,
  // actual PTY cold-start will be worse.
  if (t2 && t2.load.loadMs > 1000) {
    hitCriteria.push(`2x cold load ${fmtMs(t2.load.loadMs)} > 1s threshold`)
  }
  if (t2 && t2.navigation.p95 > 16) {
    hitCriteria.push(`2x navigation p95 ${fmtMs(t2.navigation.p95)} > 16ms frame budget`)
  }
  if (t2 && t2.backlinks.p95 > 16) {
    hitCriteria.push(`2x backlink p95 ${fmtMs(t2.backlinks.p95)} > 16ms frame budget`)
  }

  if (t10 && t10.load.loadMs < 5000 && t10.navigation.p95 < 16 && t10.backlinks.p95 < 100) {
    missCriteria.push(`10x holds (load ${fmtMs(t10.load.loadMs)}, nav p95 ${fmtMs(t10.navigation.p95)})`)
  }

  const lines: string[] = []
  if (hitCriteria.length > 0) {
    lines.push(`**Bottleneck detected** — kill-switch criteria triggered:`)
    for (const c of hitCriteria) lines.push(`- ${c}`)
    lines.push("")
    lines.push(
      "**Family A (markdown-first + derived SQLite) fails under this workload.** Scale-architecture epic should NOT auto-WONTFIX; Family B (op-log) or C (log-first) becomes a live option.",
    )
  } else if (missCriteria.length > 0 && t10) {
    lines.push(`**No bottleneck at 10x.** Kill-switch criteria not met:`)
    for (const c of missCriteria) lines.push(`- ${c}`)
    lines.push("")
    lines.push(
      "**Family A (markdown-first + derived SQLite) holds at 10x.** The scale-architecture epic is a strong candidate for auto-WONTFIX on 2026-06-01 — speculative work, not forced by evidence.",
    )
  } else {
    lines.push(
      "**Inconclusive** — some tiers ran but kill-switch thresholds were not cleanly cleared or breached. Review the numbers in the per-tier detail section.",
    )
  }

  lines.push("")
  lines.push(
    "Caveat: this harness measures the storage-layer cold path only. The epic's kill-switch also requires the bottleneck to profile to the storage/indexing/query layer — not bun boot, signal graph, or rendering. Cross-check with `tools/measure-cold-start.ts` to rule those out before closing the epic.",
  )
  return lines.join("\n")
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const { tiers, skipGen, maxGenSeconds } = parseArgs(process.argv.slice(2))
  const runDate = new Date().toISOString().slice(0, 10)

  const results: TierResult[] = []

  for (const tier of tiers) {
    console.log(`\n=== tier ${tier.label} (${tier.fileCount} files) ===`)

    // 1. Generate
    let genInfo: TierResult["generation"] = null
    if (!skipGen) {
      const tGen0 = performance.now()
      try {
        // Bail early if a single projected tier would take > maxGenSeconds
        // based on 1x real elapsed time. We still attempt the smaller tiers.
        const previous = results.find((r) => r.generation && r.workload)
        if (previous && previous.workload) {
          const perFile = previous.generation!.durationMs / previous.workload.fileCount
          const projected = (perFile * tier.fileCount) / 1000
          if (projected > maxGenSeconds) {
            genInfo = {
              durationMs: 0,
              totalMB: 0,
              skipped: `projected generation ${projected.toFixed(0)}s > cap ${maxGenSeconds}s`,
            }
            console.log(`  skipping generation (projected ${projected.toFixed(0)}s)`)
            results.push({
              tier: tier.label,
              fileCount: tier.fileCount,
              generation: genInfo,
              workload: null,
              error: null,
            })
            continue
          }
        }

        const r = generateVault({
          outDir: tier.vaultDir,
          fileCount: tier.fileCount,
          seed: 0x5ca1e + tier.fileCount, // unique seed per tier
        })
        genInfo = {
          durationMs: r.durationMs,
          totalMB: r.totalBytes / 1024 / 1024,
        }
        console.log(
          `  generated ${r.fileCount} files, ${genInfo.totalMB.toFixed(1)} MB in ${fmtMs(r.durationMs)}`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  generation failed: ${msg}`)
        results.push({
          tier: tier.label,
          fileCount: tier.fileCount,
          generation: { durationMs: performance.now() - tGen0, totalMB: 0, skipped: msg },
          workload: null,
          error: `generation: ${msg}`,
        })
        continue
      }
    }

    // 2. Workload
    try {
      console.log(`  running workload...`)
      const w = await runWorkload(tier.vaultDir, tier.label)
      console.log(
        `  load ${fmtMs(w.load.loadMs)} ` +
          `(${w.load.nodeCount} nodes, RSS ${fmtMB(w.rssSteadyMB)}), ` +
          `nav p95 ${fmtMs(w.navigation.p95)}, backlink p95 ${fmtMs(w.backlinks.p95)}, ` +
          `reconcile ${fmtMs(w.reconcile.durationMs)}`,
      )
      results.push({
        tier: tier.label,
        fileCount: tier.fileCount,
        generation: genInfo,
        workload: w,
        error: null,
      })
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
      console.log(`  workload failed: ${msg}`)
      results.push({
        tier: tier.label,
        fileCount: tier.fileCount,
        generation: genInfo,
        workload: null,
        error: `workload: ${msg}`,
      })
    }
  }

  // 3. Assemble report
  const report: BenchReport = {
    runDate,
    host: {
      platform: process.platform,
      arch: process.arch,
      memoryMB: Math.round(
        (typeof Bun !== "undefined" ? (Bun as unknown as { os?: { memory?: number } }).os?.memory ?? 0 : 0) /
          1024 /
          1024,
      ) || 131_072, // M5 Max default noted in CLAUDE.md
      bunVersion: typeof Bun !== "undefined" ? (Bun as unknown as { version: string }).version : "unknown",
    },
    tiers: results,
    summary: {
      tiersCompleted: results.filter((r) => r.workload).map((r) => r.tier),
      tiersSkipped: results.filter((r) => !r.workload).map((r) => r.tier),
      verdict: deriveVerdict(results),
    },
  }

  // 4. Write outputs
  const hubDir = join(REPO_ROOT, "hub", "km")
  mkdirSync(hubDir, { recursive: true })
  const jsonPath = join(hubDir, `scale-bench-results-${runDate}.json`)
  const mdPath = join(hubDir, `scale-bench-results-${runDate}.md`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  writeFileSync(mdPath, renderMarkdown(report))

  console.log(`\n=== report written ===`)
  console.log(`  ${jsonPath}`)
  console.log(`  ${mdPath}`)
  console.log(`\n=== verdict ===`)
  console.log(report.summary.verdict)
}

void main()

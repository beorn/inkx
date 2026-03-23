#!/usr/bin/env bun

/**
 * Autoresearch runner — measures performance + quality, compares to baseline, renders verdict.
 *
 * Usage:
 *   bun infra/autoresearch/run.ts --baseline    # Establish baseline (first run)
 *   bun infra/autoresearch/run.ts               # Measure + compare + verdict
 *   bun infra/autoresearch/run.ts --dry         # Measure only, no verdict
 */

import { spawn } from "bun"
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs"
import { join } from "path"

const ROOT = import.meta.dir.replace(/\/infra\/autoresearch$/, "")
const DATA_DIR = join(ROOT, "infra/autoresearch/data")
const BASELINE_FILE = join(DATA_DIR, "baseline.json")
const RESULTS_FILE = join(DATA_DIR, "results.tsv")
const BENCH_FILES = [
  "benchmarks/queries.bench.ts",
  "benchmarks/parser.bench.ts",
  "benchmarks/sync.bench.ts",
  "benchmarks/link-resolver.bench.ts",
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchResult {
  name: string
  median: number // ms (p50)
  mean: number
  hz: number // ops/sec
  samples: number
}

interface ProfileResult {
  loadRepo: number
  buildBoardState: number
  deriveColumns: number
  reactMount: number
  pipelineTotal: number
  pipelineLayout: number
  pipelineContent: number
  pipelineOutput: number
}

interface QualityResult {
  linesAdded: number
  linesRemoved: number
  netLines: number
  complexityWarnings: number
  filesChanged: number
}

interface Measurement {
  timestamp: string
  commitHash: string
  commitMessage: string
  benchmarks: BenchResult[]
  profile: ProfileResult
  quality: QualityResult
  benchGeomean: number // geometric mean of benchmark medians (ops/sec)
  profileTotal: number // sum of profile phases
}

interface Verdict {
  decision: "KEEP" | "STRONG_KEEP" | "DISCARD"
  reasons: string[]
  benchDelta: number // % change in geomean (positive = faster)
  profileDelta: number // % change in profile total (negative = faster)
  qualityOk: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function run(
  cmd: string[],
  opts: { cwd?: string; timeout?: number } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = spawn(cmd, {
    cwd: opts.cwd ?? ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" },
  })
  const timeout = opts.timeout ?? 300_000
  const timer = setTimeout(() => proc.kill(), timeout)
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  clearTimeout(timer)
  return { ok: code === 0, stdout, stderr }
}

function getCommitInfo(): { hash: string; message: string } {
  const hashProc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: ROOT })
  const msgProc = Bun.spawnSync(["git", "log", "-1", "--format=%s"], { cwd: ROOT })
  return {
    hash: hashProc.stdout.toString().trim(),
    message: msgProc.stdout.toString().trim(),
  }
}

function geometricMean(values: number[]): number {
  if (values.length === 0) return 0
  const logSum = values.reduce((s, v) => s + Math.log(v), 0)
  return Math.exp(logSum / values.length)
}

// ---------------------------------------------------------------------------
// Measurement phases
// ---------------------------------------------------------------------------

async function runQualityGates(): Promise<{ ok: boolean; error?: string }> {
  process.stderr.write("\n--- Quality gates ---\n")

  process.stderr.write("  Lint + format (bun fix)... ")
  const lint = await run(["bun", "fix"], { timeout: 60_000 })
  if (!lint.ok) {
    process.stderr.write("FAIL\n")
    return { ok: false, error: "bun fix failed:\n" + lint.stderr.slice(-500) }
  }
  process.stderr.write("OK\n")

  process.stderr.write("  Tests (bun run test:fast)... ")
  const tests = await run(["bun", "run", "test:fast"], { timeout: 180_000 })
  if (!tests.ok) {
    process.stderr.write("FAIL\n")
    return { ok: false, error: "Tests failed:\n" + tests.stderr.slice(-500) }
  }
  process.stderr.write("OK\n")

  return { ok: true }
}

async function runBenchmarks(): Promise<BenchResult[]> {
  process.stderr.write("\n--- Benchmarks ---\n")
  const results: BenchResult[] = []
  const tmpFile = join(DATA_DIR, "bench-tmp.json")

  for (const file of BENCH_FILES) {
    process.stderr.write(`  ${file}... `)
    const res = await run(["bun", "vitest", "bench", file, "--outputJson", tmpFile], { timeout: 120_000 })

    if (existsSync(tmpFile)) {
      try {
        const json = JSON.parse(readFileSync(tmpFile, "utf-8")) as {
          files?: {
            groups?: {
              fullName: string
              benchmarks?: { name: string; period?: number; mean: number; hz: number; samples?: unknown[] }[]
            }[]
          }[]
        }
        for (const f of json.files ?? []) {
          for (const g of f.groups ?? []) {
            for (const b of g.benchmarks ?? []) {
              if (b.hz > 0) {
                results.push({
                  name: `${g.fullName} > ${b.name}`,
                  median: b.period ?? b.mean,
                  mean: b.mean,
                  hz: b.hz,
                  samples: b.samples?.length ?? 0,
                })
              }
            }
          }
        }
        process.stderr.write(`${results.length} benchmarks\n`)
      } catch {
        process.stderr.write("parse error\n")
      }
    } else {
      process.stderr.write("no output\n")
    }
  }

  // Clean up
  try {
    Bun.spawnSync(["rm", "-f", tmpFile])
  } catch {}

  return results
}

async function runProfile(): Promise<ProfileResult> {
  process.stderr.write("\n--- Profile startup ---\n")
  const res = await run(["bun", "apps/km-tui/tests/profile-startup.ts"], { timeout: 60_000 })
  const output = res.stderr + res.stdout

  function extractMs(label: string): number {
    const match = output.match(new RegExp(`${label}[^:]*:\\s*([\\d.]+)ms`))
    return match ? parseFloat(match[1]) : 0
  }

  const result: ProfileResult = {
    loadRepo: extractMs("Load repo"),
    buildBoardState: extractMs("buildBoardState"),
    deriveColumns: extractMs("deriveColumnsFromRepo"),
    reactMount: extractMs("boardApp\\.run"),
    pipelineTotal: extractMs("total"),
    pipelineLayout: extractMs("layout"),
    pipelineContent: extractMs("content"),
    pipelineOutput: extractMs("output"),
  }

  process.stderr.write(`  Load: ${result.loadRepo}ms, Build: ${result.buildBoardState}ms, `)
  process.stderr.write(`React: ${result.reactMount}ms, Pipeline: ${result.pipelineTotal}ms\n`)

  return result
}

function measureQuality(isBaseline: boolean): QualityResult {
  process.stderr.write("\n--- Quality metrics ---\n")

  let linesAdded = 0
  let linesRemoved = 0
  let filesChanged = 0

  if (!isBaseline) {
    // Diff this commit vs its parent — measures just the experiment's change
    const numstatProc = Bun.spawnSync(["git", "diff", "--numstat", "HEAD~1", "--", ".", ":!infra/autoresearch"], {
      cwd: ROOT,
    })
    for (const line of numstatProc.stdout.toString().trim().split("\n")) {
      const [add, del] = line.split("\t")
      if (add && del && add !== "-") {
        linesAdded += parseInt(add, 10) || 0
        linesRemoved += parseInt(del, 10) || 0
        filesChanged++
      }
    }
  }

  // Complexity check
  const cxProc = Bun.spawnSync(["bun", "lint:complexity", "--brief"], { cwd: ROOT })
  const cxLines = cxProc.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((l) => l.includes("WARNING") || l.includes("ERROR"))

  const result: QualityResult = {
    linesAdded,
    linesRemoved,
    netLines: linesAdded - linesRemoved,
    complexityWarnings: cxLines.length,
    filesChanged,
  }

  process.stderr.write(`  +${linesAdded} -${linesRemoved} (net ${result.netLines}) in ${filesChanged} files\n`)
  process.stderr.write(`  Complexity warnings: ${result.complexityWarnings}\n`)

  return result
}

// ---------------------------------------------------------------------------
// Comparison & Verdict
// ---------------------------------------------------------------------------

function compare(current: Measurement, baseline: Measurement): Verdict {
  const reasons: string[] = []

  // Benchmark comparison (ops/sec — higher is better)
  const benchDelta =
    baseline.benchGeomean > 0 ? ((current.benchGeomean - baseline.benchGeomean) / baseline.benchGeomean) * 100 : 0

  // Profile comparison (ms — lower is better)
  const profileDelta =
    baseline.profileTotal > 0 ? ((current.profileTotal - baseline.profileTotal) / baseline.profileTotal) * 100 : 0

  // Check individual benchmark regressions
  let anyRegression = false
  for (const curr of current.benchmarks) {
    const base = baseline.benchmarks.find((b) => b.name === curr.name)
    if (base && base.hz > 0) {
      const delta = ((curr.hz - base.hz) / base.hz) * 100
      if (delta < -10) {
        anyRegression = true
        reasons.push(`REGRESSION: "${curr.name}" ${delta.toFixed(1)}%`)
      } else if (delta > 25) {
        reasons.push(`NOTABLE: "${curr.name}" +${delta.toFixed(1)}%`)
      }
    }
  }

  // Quality check
  const q = current.quality
  const qualityOk = q.netLines <= 10 && q.complexityWarnings === 0

  if (!qualityOk) {
    if (q.netLines > 10) reasons.push(`Code grew by ${q.netLines} lines (limit: 10)`)
    if (q.complexityWarnings > 0) reasons.push(`${q.complexityWarnings} complexity warnings`)
  }

  // Decision
  let decision: Verdict["decision"]

  if (anyRegression) {
    decision = "DISCARD"
    reasons.unshift(`Individual benchmark regression >10%`)
  } else if (!qualityOk && benchDelta < 5) {
    // Quality degraded but perf gain is small — not worth it
    decision = "DISCARD"
    reasons.unshift(`Quality degraded without sufficient perf gain`)
  } else if (benchDelta < 2 && profileDelta > -2) {
    decision = "DISCARD"
    reasons.unshift(`Below noise threshold (bench: ${benchDelta.toFixed(1)}%, profile: ${profileDelta.toFixed(1)}%)`)
  } else if (benchDelta >= 10 || profileDelta <= -10) {
    decision = "STRONG_KEEP"
    reasons.unshift(`Significant improvement (bench: +${benchDelta.toFixed(1)}%, profile: ${profileDelta.toFixed(1)}%)`)
  } else {
    decision = "KEEP"
    reasons.unshift(`Improvement (bench: +${benchDelta.toFixed(1)}%, profile: ${profileDelta.toFixed(1)}%)`)
  }

  return { decision, reasons, benchDelta, profileDelta, qualityOk }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printMeasurement(m: Measurement) {
  process.stderr.write(`\n=== Measurement: ${m.commitHash} "${m.commitMessage}" ===\n`)
  process.stderr.write(`  Bench geomean: ${m.benchGeomean.toFixed(0)} ops/sec\n`)
  process.stderr.write(`  Profile total: ${m.profileTotal.toFixed(1)}ms\n`)
  process.stderr.write(
    `  Quality: +${m.quality.linesAdded} -${m.quality.linesRemoved} (net ${m.quality.netLines}), ${m.quality.complexityWarnings} complexity warnings\n`,
  )
}

function printVerdict(v: Verdict) {
  const icon = v.decision === "STRONG_KEEP" ? "★★★" : v.decision === "KEEP" ? "✓" : "✗"
  process.stderr.write(`\n${"=".repeat(60)}\n`)
  process.stderr.write(`  VERDICT: ${icon} ${v.decision}\n`)
  process.stderr.write(`${"=".repeat(60)}\n`)
  for (const r of v.reasons) {
    process.stderr.write(`  ${r}\n`)
  }
  process.stderr.write("\n")

  // Machine-readable on stdout
  console.log(
    JSON.stringify({
      verdict: v.decision,
      benchDelta: v.benchDelta,
      profileDelta: v.profileDelta,
      qualityOk: v.qualityOk,
    }),
  )
}

function appendResults(m: Measurement, v: Verdict) {
  const header =
    "timestamp\tcommit\tmessage\tverdict\tbench_geomean\tprofile_total\tbench_delta%\tprofile_delta%\tnet_lines\tcomplexity_warns\n"
  if (!existsSync(RESULTS_FILE)) {
    writeFileSync(RESULTS_FILE, header)
  }
  const row = [
    m.timestamp,
    m.commitHash,
    m.commitMessage.replace(/\t/g, " ").slice(0, 80),
    v.decision,
    m.benchGeomean.toFixed(0),
    m.profileTotal.toFixed(1),
    v.benchDelta.toFixed(1),
    v.profileDelta.toFixed(1),
    m.quality.netLines.toString(),
    m.quality.complexityWarnings.toString(),
  ].join("\t")
  appendFileSync(RESULTS_FILE, row + "\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function measure(opts: { isBaseline?: boolean } = {}): Promise<Measurement> {
  const commit = getCommitInfo()
  const benchmarks = await runBenchmarks()
  const profile = await runProfile()
  const quality = measureQuality(!!opts.isBaseline)

  const benchGeomean = geometricMean(benchmarks.map((b) => b.hz))
  const profileTotal = profile.loadRepo + profile.buildBoardState + profile.deriveColumns + profile.reactMount

  return {
    timestamp: new Date().toISOString(),
    commitHash: commit.hash,
    commitMessage: commit.message,
    benchmarks,
    profile,
    quality,
    benchGeomean,
    profileTotal,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isBaseline = args.includes("--baseline")
  const isDry = args.includes("--dry")

  mkdirSync(DATA_DIR, { recursive: true })

  if (!isBaseline) {
    // Run quality gates first (fast fail)
    const gates = await runQualityGates()
    if (!gates.ok) {
      process.stderr.write(`\n✗ DISCARD — quality gate failed\n  ${gates.error}\n`)
      console.log(JSON.stringify({ verdict: "DISCARD", reason: "quality_gate_failed" }))
      process.exit(1)
    }
  }

  // Measure
  const measurement = await measure({ isBaseline })
  printMeasurement(measurement)

  if (isBaseline) {
    // Save as baseline
    writeFileSync(BASELINE_FILE, JSON.stringify(measurement, null, 2))
    process.stderr.write(`\n✓ Baseline saved to ${BASELINE_FILE}\n`)
    process.stderr.write(
      `  ${measurement.benchmarks.length} benchmarks, geomean ${measurement.benchGeomean.toFixed(0)} ops/sec\n`,
    )
    process.stderr.write(`  Profile total: ${measurement.profileTotal.toFixed(1)}ms\n`)
    console.log(
      JSON.stringify({
        baseline: true,
        benchGeomean: measurement.benchGeomean,
        profileTotal: measurement.profileTotal,
      }),
    )
    return
  }

  if (isDry) {
    process.stderr.write("\n(dry run — no verdict)\n")
    return
  }

  // Compare to baseline
  if (!existsSync(BASELINE_FILE)) {
    process.stderr.write("\n✗ No baseline found. Run with --baseline first.\n")
    process.exit(1)
  }

  const baseline: Measurement = JSON.parse(readFileSync(BASELINE_FILE, "utf-8"))
  const verdict = compare(measurement, baseline)
  printVerdict(verdict)
  appendResults(measurement, verdict)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

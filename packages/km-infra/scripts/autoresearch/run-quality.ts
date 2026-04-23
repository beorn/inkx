#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */

/**
 * Autoresearch quality runner — measures code quality, compares to baseline, renders verdict.
 *
 * Metrics:
 * - Lint warnings + errors (oxlint)
 * - Complexity findings (cyclomatic + cognitive > advisory thresholds)
 * - Total complexity score (sum of all findings)
 * - Lines of code (in target packages)
 * - Test count
 *
 * Usage:
 *   bun packages/km-infra/scripts/autoresearch/run-quality.ts --baseline   # Establish baseline
 *   bun packages/km-infra/scripts/autoresearch/run-quality.ts              # Measure + compare + verdict
 *   bun packages/km-infra/scripts/autoresearch/run-quality.ts --dry        # Measure only, no verdict
 */

import { spawn } from "bun"
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs"
import { join } from "path"

const ROOT = import.meta.dir.replace(/\/packages\/km-infra\/scripts\/autoresearch$/, "")
const DATA_DIR = join(ROOT, "packages/km-infra/scripts/autoresearch/data")
const BASELINE_FILE = join(DATA_DIR, "quality-baseline.json")
const RESULTS_FILE = join(DATA_DIR, "quality-results.tsv")

// Packages to measure (the code we care about)
const TARGET_DIRS = [
  "apps/km-tui/src",
  "apps/km-cli/src",
  "packages/km-storage/src",
  "packages/km-markdown/src",
  "packages/km-board/src",
  "packages/km-core/src",
  "packages/km-tree/src",
  "packages/km-commands/src",
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QualityMeasurement {
  timestamp: string
  commitHash: string
  commitMessage: string
  lintWarnings: number
  lintErrors: number
  complexityFindings: number
  totalComplexity: number
  maxComplexity: number
  linesOfCode: number
  testCount: number
  qualityScore: number // composite (higher = better)
}

interface QualityVerdict {
  decision: "KEEP" | "STRONG_KEEP" | "DISCARD"
  reasons: string[]
  scoreDelta: number // positive = better quality
  warningsDelta: number // negative = fewer warnings
  complexityDelta: number // negative = less complexity
  locDelta: number // negative = less code
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
  const h = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: ROOT })
  const m = Bun.spawnSync(["git", "log", "-1", "--format=%s"], { cwd: ROOT })
  return { hash: h.stdout.toString().trim(), message: m.stdout.toString().trim() }
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function measureLint(): { warnings: number; errors: number } {
  process.stderr.write("  Lint... ")
  const res = Bun.spawnSync(["bun", "run", "lint"], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })
  const output = res.stderr.toString() + res.stdout.toString()
  const match = output.match(/Found (\d+) warnings? and (\d+) errors?/)
  const warnings = match ? parseInt(match[1]!, 10) : 0
  const errors = match ? parseInt(match[2]!, 10) : 0
  process.stderr.write(`${warnings} warnings, ${errors} errors\n`)
  return { warnings, errors }
}

function measureComplexity(): { findings: number; total: number; max: number } {
  process.stderr.write("  Complexity... ")
  const res = Bun.spawnSync(["bun", "lint:complexity", "--json"], { cwd: ROOT })
  try {
    const data = JSON.parse(res.stdout.toString()) as Array<{ complexity: number }>
    const total = data.reduce((s, f) => s + f.complexity, 0)
    const max = data.length > 0 ? Math.max(...data.map((f) => f.complexity)) : 0
    process.stderr.write(`${data.length} findings, total=${total}, max=${max}\n`)
    return { findings: data.length, total, max }
  } catch {
    process.stderr.write("parse error\n")
    return { findings: 0, total: 0, max: 0 }
  }
}

function measureLOC(): number {
  process.stderr.write("  Lines of code... ")
  let total = 0
  for (const dir of TARGET_DIRS) {
    const res = Bun.spawnSync(["find", dir, "-name", "*.ts", "-o", "-name", "*.tsx"], { cwd: ROOT })
    const files = res.stdout.toString().trim().split("\n").filter(Boolean)
    for (const file of files) {
      const content = Bun.spawnSync(["wc", "-l", file], { cwd: ROOT })
      const count = parseInt(content.stdout.toString().trim(), 10) || 0
      total += count
    }
  }
  process.stderr.write(`${total} lines\n`)
  return total
}

async function measureTests(): Promise<number> {
  process.stderr.write("  Test count... ")
  const res = await run(["bun", "run", "test:fast"], { timeout: 180_000 })
  // Strip ANSI codes before matching
  const output = (res.stdout + res.stderr).replace(/\x1b\[[0-9;]*m/g, "")
  // Match the "Tests  N passed" line specifically (not "Test Files")
  const match = output.match(/Tests\s+(\d+) passed/)
  const count = match ? parseInt(match[1]!, 10) : 0
  process.stderr.write(`${count} tests ${res.ok ? "passing" : "FAILING"}\n`)
  return res.ok ? count : -1 // -1 signals failure
}

function computeQualityScore(m: {
  lintWarnings: number
  lintErrors: number
  complexityFindings: number
  totalComplexity: number
  linesOfCode: number
  testCount: number
}): number {
  // Quality score: higher is better
  // Penalize warnings, errors, complexity; reward test density; neutral on LOC
  const warningPenalty = m.lintWarnings * 1 + m.lintErrors * 10
  const complexityPenalty = m.totalComplexity * 0.1 + m.complexityFindings * 2
  const testBonus = m.testCount * 0.5
  const locPenalty = m.linesOfCode * 0.01 // slight penalty for more code

  return 10000 - warningPenalty - complexityPenalty - locPenalty + testBonus
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function compare(current: QualityMeasurement, baseline: QualityMeasurement): QualityVerdict {
  const reasons: string[] = []
  const scoreDelta = current.qualityScore - baseline.qualityScore
  const warningsDelta = current.lintWarnings - baseline.lintWarnings
  const complexityDelta = current.totalComplexity - baseline.totalComplexity
  const locDelta = current.linesOfCode - baseline.linesOfCode

  // Detail changes
  if (warningsDelta < 0) reasons.push(`Warnings: ${baseline.lintWarnings} → ${current.lintWarnings} (${warningsDelta})`)
  if (warningsDelta > 0) reasons.push(`WARNING REGRESSION: warnings increased by ${warningsDelta}`)
  if (complexityDelta < 0) {
    reasons.push(`Complexity: ${baseline.totalComplexity} → ${current.totalComplexity} (${complexityDelta})`)
  }
  if (complexityDelta > 0) reasons.push(`COMPLEXITY REGRESSION: increased by ${complexityDelta}`)
  if (current.lintErrors > baseline.lintErrors) {
    reasons.push(`ERROR REGRESSION: errors increased ${baseline.lintErrors} → ${current.lintErrors}`)
  }
  if (locDelta < -10) reasons.push(`Code reduced: ${locDelta} lines`)
  if (locDelta > 20) reasons.push(`Code grew: +${locDelta} lines`)

  // Decision
  let decision: QualityVerdict["decision"]

  if (current.testCount < 0) {
    decision = "DISCARD"
    reasons.unshift("Tests FAILED")
  } else if (current.lintErrors > baseline.lintErrors) {
    decision = "DISCARD"
    reasons.unshift("Lint errors increased")
  } else if (current.testCount < baseline.testCount) {
    decision = "DISCARD"
    reasons.unshift(`Tests decreased: ${baseline.testCount} → ${current.testCount}`)
  } else if (warningsDelta > 0 && complexityDelta >= 0) {
    decision = "DISCARD"
    reasons.unshift("Quality regressed (more warnings, no complexity improvement)")
  } else if (scoreDelta <= 0) {
    decision = "DISCARD"
    reasons.unshift(`No improvement (score delta: ${scoreDelta.toFixed(1)})`)
  } else if (scoreDelta >= 20 || warningsDelta <= -5 || complexityDelta <= -20) {
    decision = "STRONG_KEEP"
    reasons.unshift(
      `Significant improvement (score: +${scoreDelta.toFixed(1)}, warnings: ${warningsDelta}, complexity: ${complexityDelta})`,
    )
  } else {
    decision = "KEEP"
    reasons.unshift(`Improvement (score: +${scoreDelta.toFixed(1)})`)
  }

  return { decision, reasons, scoreDelta, warningsDelta, complexityDelta, locDelta }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printMeasurement(m: QualityMeasurement) {
  process.stderr.write(`\n=== Quality: ${m.commitHash} "${m.commitMessage}" ===\n`)
  process.stderr.write(`  Lint: ${m.lintWarnings} warnings, ${m.lintErrors} errors\n`)
  process.stderr.write(
    `  Complexity: ${m.complexityFindings} findings, total=${m.totalComplexity}, max=${m.maxComplexity}\n`,
  )
  process.stderr.write(`  Code: ${m.linesOfCode} lines, ${m.testCount} tests\n`)
  process.stderr.write(`  Quality score: ${m.qualityScore.toFixed(1)}\n`)
}

function printVerdict(v: QualityVerdict) {
  const icon = v.decision === "STRONG_KEEP" ? "★★★" : v.decision === "KEEP" ? "✓" : "✗"
  process.stderr.write(`\n${"=".repeat(60)}\n`)
  process.stderr.write(`  VERDICT: ${icon} ${v.decision}\n`)
  process.stderr.write(`${"=".repeat(60)}\n`)
  for (const r of v.reasons) process.stderr.write(`  ${r}\n`)
  process.stderr.write("\n")
  console.log(
    JSON.stringify({
      verdict: v.decision,
      scoreDelta: v.scoreDelta,
      warningsDelta: v.warningsDelta,
      complexityDelta: v.complexityDelta,
      locDelta: v.locDelta,
    }),
  )
}

function appendResults(m: QualityMeasurement, v: QualityVerdict) {
  const header =
    "timestamp\tcommit\tmessage\tverdict\tscore\twarnings\terrors\tcomplexity\tmax_cx\tloc\ttests\tscore_delta\n"
  if (!existsSync(RESULTS_FILE)) writeFileSync(RESULTS_FILE, header)
  const row = [
    m.timestamp,
    m.commitHash,
    m.commitMessage.replace(/\t/g, " ").slice(0, 80),
    v.decision,
    m.qualityScore.toFixed(1),
    m.lintWarnings,
    m.lintErrors,
    m.totalComplexity,
    m.maxComplexity,
    m.linesOfCode,
    m.testCount,
    v.scoreDelta.toFixed(1),
  ].join("\t")
  appendFileSync(RESULTS_FILE, row + "\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function measure(): Promise<QualityMeasurement> {
  const commit = getCommitInfo()
  process.stderr.write("\n--- Quality measurement ---\n")

  const lint = measureLint()
  const cx = measureComplexity()
  const loc = measureLOC()
  const tests = await measureTests()

  const m = {
    timestamp: new Date().toISOString(),
    commitHash: commit.hash,
    commitMessage: commit.message,
    lintWarnings: lint.warnings,
    lintErrors: lint.errors,
    complexityFindings: cx.findings,
    totalComplexity: cx.total,
    maxComplexity: cx.max,
    linesOfCode: loc,
    testCount: tests < 0 ? 0 : tests,
    qualityScore: 0,
  }
  m.qualityScore = computeQualityScore(m)
  return m
}

async function main() {
  const args = process.argv.slice(2)
  const isBaseline = args.includes("--baseline")
  const isDry = args.includes("--dry")

  mkdirSync(DATA_DIR, { recursive: true })

  const measurement = await measure()
  printMeasurement(measurement)

  if (isBaseline) {
    writeFileSync(BASELINE_FILE, JSON.stringify(measurement, null, 2))
    process.stderr.write(`\n✓ Quality baseline saved\n`)
    process.stderr.write(`  Score: ${measurement.qualityScore.toFixed(1)}\n`)
    console.log(JSON.stringify({ baseline: true, score: measurement.qualityScore }))
    return
  }

  if (isDry) {
    process.stderr.write("\n(dry run — no verdict)\n")
    return
  }

  if (!existsSync(BASELINE_FILE)) {
    process.stderr.write("\n✗ No baseline. Run with --baseline first.\n")
    process.exit(1)
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf-8")) as QualityMeasurement
  const verdict = compare(measurement, baseline)
  printVerdict(verdict)
  appendResults(measurement, verdict)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

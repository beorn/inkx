#!/usr/bin/env bun
/**
 * recall-eval-hotpath.ts — evaluate the UserPromptSubmit hot-path pipeline.
 *
 * Bead: @km/bearly/recall-eval-harness-v3
 *
 * Why this exists alongside recall-eval.ts:
 *   - recall-eval.ts runs `bun recall --agent` (multi-round LLM planner +
 *     fanout + rerank + synthesis). That tests the rich query path.
 *   - The UserPromptSubmit hook does NOT use agent mode — it calls
 *     runInjectDelta() directly (Stage 0/1/2/3 gates over a single FTS5
 *     query). Two different pipelines.
 *   - Real-traffic prompts are dominated by short / anaphoric / no-anchor
 *     shapes that the agent-mode eval doesn't characterize well. Realistic
 *     evaluation requires running the hot-path code on realistic prompts.
 *
 * What this tool does:
 *   1. Reads hub/tribe/eval/recall-corpus.yaml, filters to axis D (or all)
 *   2. For each pair, calls runInjectDelta(prompt) with a fresh SeenStore
 *   3. Captures the skip-reason or emit-content
 *   4. Compares against pair.expected_action (skip | emit_inline | needs_session_state)
 *   5. Produces:
 *      - per-pair markdown report (prompt, stage decisions, emit content, verdict)
 *      - aggregate metrics (skip-F1, emit-precision, false-skip, false-emit)
 *      - HTML report at --html path (optional)
 *
 * Usage:
 *   bun tools/recall-eval-hotpath.ts              # all axis D pairs, markdown
 *   bun tools/recall-eval-hotpath.ts --pair pair-016
 *   bun tools/recall-eval-hotpath.ts --axis D     # only axis D
 *   bun tools/recall-eval-hotpath.ts --html /tmp/eval.html
 *   bun tools/recall-eval-hotpath.ts --json /tmp/eval.json
 *
 * Iteration loop:
 *   1. Run baseline:    bun tools/recall-eval-hotpath.ts --json /tmp/before.json
 *   2. Modify pipeline (e.g. add anchor-overlap gate)
 *   3. Run again:       bun tools/recall-eval-hotpath.ts --json /tmp/after.json
 *   4. Diff:            bun tools/recall-eval-hotpath.ts --diff /tmp/before.json /tmp/after.json
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import yaml from "yaml"
import {
  runInjectDelta,
  createMemorySeenStore,
} from "../vendor/bearly/plugins/recall/src/lib/inject-core.ts"
import type { InjectSkipReason } from "../vendor/bearly/plugins/recall/src/lib/prompt-filter.ts"

const REPO_ROOT = "/Users/beorn/Code/pim/km"
const CORPUS_PATH = join(REPO_ROOT, "hub/tribe/eval/recall-corpus.yaml")

// ============================================================================
// Types
// ============================================================================

type ExpectedAction = "skip" | "emit_inline" | "emit_pointer" | "needs_session_state"
type SignalSource = "S_t" | "P" | "both" | "none"

type Pair = {
  id: string
  axis: "A" | "B" | "C" | "D"
  query: string
  expected_action?: ExpectedAction
  expected_action_hot_path?: ExpectedAction
  expected_action_agent?: ExpectedAction
  expected_signal_source?: SignalSource
  expected_relevant_session_ids?: string[]
  expected_irrelevant_session_ids?: string[]
  expected_relevant_artifacts?: { kind: string; path?: string; id?: string }[]
  notes?: string
}

type Corpus = { pairs: Pair[] }

type StageDecision =
  | { stage: 0; verdict: "pass" | "skip"; reason?: InjectSkipReason }
  | { stage: 1; verdict: "pass" | "skip"; reason?: InjectSkipReason; details: { length: number; hadSalience?: boolean } }
  | { stage: 2; verdict: "pass" | "skip"; reason?: InjectSkipReason; details: { totalResults: number } }
  | { stage: 3; verdict: "pass" | "skip"; reason?: InjectSkipReason; details: { afterRankGate: number; afterDedup: number; afterContent: number; afterAll: number } }
  | { stage: 4; verdict: "emit"; details: { snippetCount: number; chars: number } }

type SalienceRule = { name: string; matched: boolean; sample?: string }
type SalienceTrace = {
  length: number
  bypassed: boolean
  rules: SalienceRule[]
  verdict: "salient" | "low_salience" | "short" | "trivial" | "slash" | "empty"
  reason: string
}

type PairResult = {
  pair: Pair
  mode: "hot-path" | "agent"
  expectedAction?: ExpectedAction
  finalAction: "skipped" | "emitted"
  skipReason?: InjectSkipReason
  emitContent?: string
  emitChars: number
  durationMs: number
  salience?: SalienceTrace
  // Verdict against expected_action:
  match: "correct" | "false_skip" | "false_emit" | "wrong_skip_reason" | "incomplete"
  matchExplanation: string
}

// ============================================================================
// Args
// ============================================================================

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag)
    return i < 0 ? def : argv[i + 1]
  }
  return {
    pair: get("--pair"),
    axis: get("--axis") as "A" | "B" | "C" | "D" | undefined,
    mode: (get("--mode", "hot-path") as "hot-path" | "agent"),
    html: get("--html"),
    jsonOut: get("--json"),
    diffA: get("--diff"),
    diffB: argv.includes("--diff") ? argv[argv.indexOf("--diff") + 2] : undefined,
    quiet: argv.includes("--quiet"),
  }
}

// ============================================================================
// Verdict logic
// ============================================================================

// Salience trace mirroring vendor/bearly/plugins/recall/src/lib/prompt-filter.ts.
// Kept here so the eval tool is self-contained and can show the calc per pair.
const SALIENCE_RULES_LOCAL: { name: string; re: RegExp }[] = [
  { name: "kebab-id", re: /\b[a-z]+(?:-[a-z0-9]+){1,}\b/ },
  { name: "path", re: /\b[a-zA-Z0-9_./-]*\/[a-zA-Z0-9_./-]+\.[a-z]{1,5}\b|\b(?:tools|packages|apps|hub|docs|vendor)\/[a-zA-Z0-9_./-]+/ },
  { name: "backticked", re: /`[^`\n]{2,}`/ },
  { name: "quoted-double", re: /"[^"\n]{4,}"/ },
  { name: "error-class", re: /\b[A-Z][a-zA-Z]+(?:Error|Exception|Warning|Bug|Failure)\b/ },
  { name: "scoped-pkg", re: /@[a-z0-9-]+\/[a-z0-9-]+/ },
]
const TRIVIAL_LOCAL = new Set([
  "yes", "no", "y", "n", "ok", "okay", "sure", "continue", "go ahead",
  "lgtm", "looks good", "do it", "proceed", "thanks", "thank you", "done",
  "sounds good", "go for it",
])
const LONG_PROMPT_BYPASS = 120

function traceSalience(prompt: string): SalienceTrace {
  const length = prompt.length
  const trimmed = prompt.trim()
  if (!trimmed) return { length, bypassed: false, rules: [], verdict: "empty", reason: "empty prompt" }
  if (trimmed.length < 15) return { length, bypassed: false, rules: [], verdict: "short", reason: `length ${length} < 15` }
  if (TRIVIAL_LOCAL.has(trimmed.toLowerCase()))
    return { length, bypassed: false, rules: [], verdict: "trivial", reason: "matched trivial-prompts list" }
  if (trimmed.startsWith("/"))
    return { length, bypassed: false, rules: [], verdict: "slash", reason: "starts with /" }
  const rules: SalienceRule[] = SALIENCE_RULES_LOCAL.map((r) => {
    const m = prompt.match(r.re)
    return { name: r.name, matched: !!m, sample: m?.[0] }
  })
  const bypassed = length >= LONG_PROMPT_BYPASS
  const anyMatch = rules.some((r) => r.matched)
  if (anyMatch) {
    const hits = rules.filter((r) => r.matched).map((r) => `${r.name}:${r.sample}`).join(", ")
    return { length, bypassed, rules, verdict: "salient", reason: `matched [${hits}]` }
  }
  if (bypassed)
    return { length, bypassed, rules, verdict: "salient", reason: `length ${length} >= ${LONG_PROMPT_BYPASS} (long-prompt bypass)` }
  return { length, bypassed, rules, verdict: "low_salience", reason: `length ${length} < ${LONG_PROMPT_BYPASS} and no salience pattern matched` }
}

function pickExpectedAction(pair: Pair, mode: "hot-path" | "agent"): ExpectedAction | undefined {
  if (mode === "hot-path" && pair.expected_action_hot_path) return pair.expected_action_hot_path
  if (mode === "agent" && pair.expected_action_agent) return pair.expected_action_agent
  return pair.expected_action
}

function classifyVerdict(pair: Pair, result: PairResult): { match: PairResult["match"]; explanation: string } {
  const expected = pickExpectedAction(pair, result.mode)
  const got = result.finalAction

  if (!expected) {
    // Old-axis pairs without expected_action — fall back to "did it emit something
    // related to the expected sessions?". Mark as incomplete since we don't have
    // the action axis.
    return { match: "incomplete", explanation: "no expected_action label (legacy axis)" }
  }

  if (expected === "skip" && got === "skipped") {
    return { match: "correct", explanation: `correctly skipped (reason=${result.skipReason})` }
  }

  if (expected === "skip" && got === "emitted") {
    return {
      match: "false_emit",
      explanation: `emitted ${result.emitChars} chars when prompt was non-substantive — over-emit`,
    }
  }

  if (expected === "emit_inline" && got === "emitted") {
    return { match: "correct", explanation: `correctly emitted ${result.emitChars} chars` }
  }

  if (expected === "emit_inline" && got === "skipped") {
    return {
      match: "false_skip",
      explanation: `skipped (reason=${result.skipReason}) when emit was expected — under-emit`,
    }
  }

  if (expected === "emit_pointer" && got === "emitted") {
    return {
      match: "incomplete",
      explanation: "emitted but pointer-mode not implemented yet — counted as inline emit",
    }
  }

  if (expected === "emit_pointer" && got === "skipped") {
    return {
      match: "false_skip",
      explanation: `skipped when pointer-emit was expected`,
    }
  }

  if (expected === "needs_session_state") {
    // Without S_t support, current behavior is to skip (low_salience). That's
    // the *correct* current-pipeline behavior — emitting random stuff would be
    // worse. Mark as correct-skip-pending-S_t.
    if (got === "skipped") {
      return {
        match: "correct",
        explanation: `correctly skipped (reason=${result.skipReason}) — pipeline lacks S_t support today; this is the right behavior until S_t feature lands`,
      }
    } else {
      return {
        match: "false_emit",
        explanation: `emitted without S_t support — should skip when prompt requires session context (got ${result.emitChars} chars; likely irrelevant)`,
      }
    }
  }

  return { match: "incomplete", explanation: `unhandled expected=${expected} got=${got}` }
}

// ============================================================================
// Run pipeline on a single pair
// ============================================================================

async function evalPair(pair: Pair, mode: "hot-path" | "agent"): Promise<PairResult> {
  const start = Date.now()
  const salience = traceSalience(pair.query)
  const expectedAction = pickExpectedAction(pair, mode)

  if (mode === "hot-path") {
    const store = createMemorySeenStore()
    const r = await runInjectDelta(pair.query, store)
    const durationMs = Date.now() - start
    const partial: Omit<PairResult, "match" | "matchExplanation"> = {
      pair,
      mode,
      expectedAction,
      finalAction: r.skipped ? "skipped" : "emitted",
      skipReason: r.skipped ? r.reason : undefined,
      emitContent: r.skipped ? undefined : r.additionalContext,
      emitChars: r.skipped ? 0 : r.additionalContext.length,
      durationMs,
      salience,
    }
    const { match, explanation } = classifyVerdict(pair, partial as PairResult)
    return { ...partial, match, matchExplanation: explanation }
  }

  // Agent mode: spawn `bun recall --agent <prompt> --json --max-rounds 1`.
  // Captures the planner-driven result with session-tail context.
  const { spawn } = await import("node:child_process")
  const res = await new Promise<{ stdout: string; code: number }>((resolve) => {
    const proc = spawn("bun", ["recall", "--agent", "--json", "--max-rounds", "1", pair.query], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
    proc.on("close", (code: number | null) => resolve({ stdout, code: code ?? -1 }))
  })
  const durationMs = Date.now() - start

  let synthesis = ""
  let resultsCount = 0
  if (res.code === 0) {
    const jsonStart = res.stdout.indexOf("{")
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(res.stdout.slice(jsonStart)) as {
          synthesis?: string
          results?: { sessionId?: string; snippet?: string }[]
        }
        synthesis = parsed.synthesis ?? ""
        resultsCount = parsed.results?.length ?? 0
      } catch {
        // parse error
      }
    }
  }

  // Agent mode "emit" = produced a non-trivial synthesis. "skip" = no synthesis
  // (means "no relevant prior knowledge found" or empty result).
  const emitted = synthesis.trim().length > 30 && !/^no relevant/i.test(synthesis.trim())
  const partial: Omit<PairResult, "match" | "matchExplanation"> = {
    pair,
    mode,
    expectedAction,
    finalAction: emitted ? "emitted" : "skipped",
    skipReason: emitted ? undefined : ("no_results" as InjectSkipReason),
    emitContent: emitted ? `[agent synthesis from ${resultsCount} hits]\n${synthesis}` : undefined,
    emitChars: emitted ? synthesis.length : 0,
    durationMs,
    salience,
  }
  const { match, explanation } = classifyVerdict(pair, partial as PairResult)
  return { ...partial, match, matchExplanation: explanation }
}

// ============================================================================
// Reporting
// ============================================================================

function fmtPair(r: PairResult): string {
  const lines: string[] = []
  const verdictBadge = {
    correct: "✓",
    false_skip: "✗ false_skip",
    false_emit: "✗ false_emit",
    wrong_skip_reason: "~ wrong_reason",
    incomplete: "? incomplete",
  }[r.match]
  lines.push(`${verdictBadge}  ${r.pair.id} [${r.pair.axis}]  ${r.durationMs}ms`)
  lines.push(`  prompt: ${JSON.stringify(r.pair.query.slice(0, 100))}`)
  lines.push(`  expected: action=${r.pair.expected_action ?? "?"}, signal=${r.pair.expected_signal_source ?? "?"}`)
  lines.push(`  got: ${r.finalAction}${r.skipReason ? ` (reason=${r.skipReason})` : ` (chars=${r.emitChars})`}`)
  lines.push(`  verdict: ${r.matchExplanation}`)
  if (r.emitContent && r.emitChars > 0) {
    const preview = r.emitContent.replace(/\s+/g, " ").trim().slice(0, 200)
    lines.push(`  emit: ${preview}${r.emitContent.length > 200 ? "…" : ""}`)
  }
  return lines.join("\n")
}

function fmtAggregate(results: PairResult[]): string {
  const total = results.length
  const correct = results.filter((r) => r.match === "correct").length
  const falseSkip = results.filter((r) => r.match === "false_skip").length
  const falseEmit = results.filter((r) => r.match === "false_emit").length
  const incomplete = results.filter((r) => r.match === "incomplete").length

  const skipExpected = results.filter((r) => r.pair.expected_action === "skip" || r.pair.expected_action === "needs_session_state").length
  const emitExpected = results.filter((r) => r.pair.expected_action === "emit_inline" || r.pair.expected_action === "emit_pointer").length

  // Skip F1: how good are we at correctly skipping when skip is expected?
  const skippedCorrectly = results.filter(
    (r) => (r.pair.expected_action === "skip" || r.pair.expected_action === "needs_session_state") && r.finalAction === "skipped",
  ).length
  const skipPrecision = skipExpected === 0 ? 1 : skippedCorrectly / skipExpected
  const overEmits = results.filter((r) => r.match === "false_emit").length
  const skipRecall = (skippedCorrectly + overEmits) === 0 ? 1 : skippedCorrectly / (skippedCorrectly + overEmits)
  const skipF1 = (skipPrecision + skipRecall) === 0 ? 0 : 2 * (skipPrecision * skipRecall) / (skipPrecision + skipRecall)

  // Emit precision: when we did emit, did we emit on prompts where emit was expected?
  const emitsAttempted = results.filter((r) => r.finalAction === "emitted").length
  const emitsCorrect = results.filter((r) => r.finalAction === "emitted" && (r.pair.expected_action === "emit_inline" || r.pair.expected_action === "emit_pointer")).length
  const emitPrecision = emitsAttempted === 0 ? 1 : emitsCorrect / emitsAttempted

  // Emit recall: when emit was expected, did we emit?
  const emitsCalled = results.filter((r) => (r.pair.expected_action === "emit_inline" || r.pair.expected_action === "emit_pointer") && r.finalAction === "emitted").length
  const emitRecall = emitExpected === 0 ? 1 : emitsCalled / emitExpected

  const skipReasonBreakdown: Record<string, number> = {}
  for (const r of results) {
    if (r.skipReason) skipReasonBreakdown[r.skipReason] = (skipReasonBreakdown[r.skipReason] ?? 0) + 1
  }

  const lines: string[] = []
  lines.push("")
  lines.push("=".repeat(70))
  lines.push("AGGREGATE")
  lines.push("=".repeat(70))
  lines.push(`Pairs: ${total} | correct ${correct} | false_skip ${falseSkip} | false_emit ${falseEmit} | incomplete ${incomplete}`)
  lines.push("")
  lines.push("Skip handling (when expected to skip OR needs S_t):")
  lines.push(`  skip-precision: ${skipPrecision.toFixed(2)}  (correctly-skipped / should-have-skipped)`)
  lines.push(`  skip-recall:    ${skipRecall.toFixed(2)}  (correctly-skipped / (correctly-skipped + over-emitted))`)
  lines.push(`  skip-F1:        ${skipF1.toFixed(2)}`)
  lines.push("")
  lines.push("Emit handling (when expected to emit):")
  lines.push(`  emit-precision: ${emitPrecision.toFixed(2)}  (correct-emits / total-emits)`)
  lines.push(`  emit-recall:    ${emitRecall.toFixed(2)}  (correct-emits / total-expected-emits)`)
  lines.push("")
  lines.push("Skip reason breakdown:")
  for (const [reason, count] of Object.entries(skipReasonBreakdown).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${reason.padEnd(22)} ${count}`)
  }
  return lines.join("\n")
}

function htmlReport(results: PairResult[], aggregate: string): string {
  const verdictColor = (m: string) =>
    m === "correct" ? "#2d7a3a" : m === "false_skip" ? "#b85c00" : m === "false_emit" ? "#c41e3a" : "#6a737d"
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const rows = results
    .map(
      (r) => `
    <tr style="border-bottom:1px solid #ddd; vertical-align:top;">
      <td><span style="color:${verdictColor(r.match)}; font-weight:600;">${r.match}</span></td>
      <td><code>${r.pair.id}</code><br/><small>axis ${r.pair.axis}</small></td>
      <td><code style="white-space: pre-wrap;">${escape(r.pair.query)}</code></td>
      <td>action: <b>${r.pair.expected_action ?? "?"}</b><br/>signal: ${r.pair.expected_signal_source ?? "?"}</td>
      <td>${r.finalAction}<br/><small>${r.skipReason ?? `${r.emitChars}ch`}</small></td>
      <td><small>${escape(r.matchExplanation)}</small></td>
      <td><small><pre style="max-height:120px;overflow:auto;background:#f6f8fa;padding:4px;">${escape((r.emitContent ?? "").slice(0, 400))}</pre></small></td>
    </tr>`,
    )
    .join("")
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>recall hot-path eval</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1400px; margin: 1em auto; padding: 0 1em; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { background: #f0f0f0; text-align: left; padding: 8px; }
  td { padding: 6px; }
  code { font-size: 12px; }
  pre { font-size: 11px; margin: 0; }
  .agg { background: #fffbe6; padding: 1em; border-left: 4px solid #fab005; white-space: pre; font-family: monospace; }
</style>
</head><body>
<h1>recall hot-path eval</h1>
<p>Pipeline: <code>vendor/bearly/plugins/recall/src/lib/inject-core.ts:runInjectDelta</code></p>
<div class="agg">${escape(aggregate)}</div>
<h2>Per-pair detail</h2>
<table>
  <thead><tr><th>verdict</th><th>pair</th><th>prompt</th><th>expected</th><th>got</th><th>explanation</th><th>emit (preview)</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`
}

// ============================================================================
// Diff mode
// ============================================================================

async function runDiff(beforePath: string, afterPath: string): Promise<void> {
  const before = JSON.parse(await readFile(beforePath, "utf8")) as PairResult[]
  const after = JSON.parse(await readFile(afterPath, "utf8")) as PairResult[]
  const byId = new Map(before.map((r) => [r.pair.id, r]))
  console.log(`recall-eval-hotpath diff: ${beforePath} → ${afterPath}`)
  console.log("")
  let flipped = 0
  for (const a of after) {
    const b = byId.get(a.pair.id)
    if (!b) continue
    if (b.match !== a.match) {
      flipped++
      console.log(`${a.pair.id} [${a.pair.axis}]: ${b.match} → ${a.match}`)
      console.log(`  prompt: ${JSON.stringify(a.pair.query.slice(0, 80))}`)
      console.log(`  before: ${b.finalAction} ${b.skipReason ?? `(${b.emitChars}ch)`}`)
      console.log(`  after:  ${a.finalAction} ${a.skipReason ?? `(${a.emitChars}ch)`}`)
      console.log("")
    }
  }
  console.log(`Total flipped: ${flipped} of ${after.length} pairs`)
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.diffA && args.diffB) {
    await runDiff(args.diffA, args.diffB)
    return
  }

  const corpusText = await readFile(CORPUS_PATH, "utf8")
  const corpus = yaml.parse(corpusText) as Corpus

  let pairs = corpus.pairs
  if (args.pair) pairs = pairs.filter((p) => p.id === args.pair)
  if (args.axis) pairs = pairs.filter((p) => p.axis === args.axis)
  if (pairs.length === 0) {
    console.error(`No pairs match (pair=${args.pair ?? "?"}, axis=${args.axis ?? "?"})`)
    process.exit(1)
  }

  if (!args.quiet) {
    console.log(`recall-eval-hotpath — pairs=${pairs.length} mode=${args.mode} corpus=${CORPUS_PATH}`)
    console.log("")
  }

  const results: PairResult[] = []
  for (const pair of pairs) {
    const r = await evalPair(pair, args.mode)
    results.push(r)
    if (!args.quiet) {
      console.log(fmtPair(r))
      console.log("")
    }
  }

  const aggregate = fmtAggregate(results)
  console.log(aggregate)

  if (args.html) {
    await writeFile(args.html, htmlReport(results, aggregate))
    console.log(`\nHTML report: ${args.html}`)
  }
  if (args.jsonOut) {
    await writeFile(args.jsonOut, JSON.stringify(results, null, 2))
    console.log(`JSON results: ${args.jsonOut}`)
  }
}

main().catch((err) => {
  console.error("recall-eval-hotpath: error:", err)
  process.exit(1)
})

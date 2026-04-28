#!/usr/bin/env bun
/**
 * recall-eval.ts — corpus-driven evaluation for the recall pipeline.
 *
 * Bead: km-tribe.recall-eval-corpus
 *
 * Reads hub/tribe/eval/recall-corpus.yaml, runs each pair through the recall
 * pipeline, and scores against labeled expected_relevant / expected_irrelevant.
 *
 * Outputs:
 *   - Per-pair report with the planner's multi-step trace (round 1 + 2 variants,
 *     fanout stats, top-K hits, synth path). The trace is the artifact the user
 *     wanted to see — visible exploration, not a black-box score.
 *   - Aggregate metrics: precision@K, recall@K, MRR, trap-hit-rate.
 *   - Optional CSV for delta tracking across modes.
 *
 * Modes (--mode):
 *   baseline           — current pipeline (max-rounds=2, default)
 *   no-synthesis       — same with synthesis stripped (--no-speculative-synth)
 *   max-rounds-1       — single round (cheaper, less recall)
 *   max-rounds-4       — deeper inner loop (proxy for km-tribe.recall-deep-rounds)
 *
 * Usage:
 *   bun tools/recall-eval.ts                     # default: baseline mode, all pairs
 *   bun tools/recall-eval.ts --mode no-synthesis
 *   bun tools/recall-eval.ts --pair pair-001     # single pair, with full trace
 *   bun tools/recall-eval.ts --csv /tmp/eval.csv # CSV per-pair scores
 *   bun tools/recall-eval.ts --top-k 3           # top-K window for precision/recall
 */

import { spawn } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import yaml from "yaml"

const REPO_ROOT = "/Users/beorn/Code/pim/km"
const CORPUS_PATH = join(REPO_ROOT, "hub/tribe/eval/recall-corpus.yaml")

type Pair = {
  id: string
  axis: "A" | "B" | "C"
  query: string
  expected_relevant_session_ids?: string[]
  expected_irrelevant_session_ids?: string[]
  expected_relevant_artifacts?: { kind: string; path?: string; id?: string }[]
  notes?: string
  conversation_prefix?: string
}

type Corpus = { pairs: Pair[] }

type RecallResult = {
  query: string
  synthesis?: string
  results?: {
    type?: string
    sessionId?: string
    sessionTitle?: string | null
    snippet?: string
    rank?: number
  }[]
  llmCost?: number
  durationMs?: number
  trace?: unknown
  timing?: unknown
}

type Mode = "baseline" | "no-synthesis" | "max-rounds-1" | "max-rounds-4"

type PairScore = {
  pairId: string
  axis: string
  query: string
  topKSessionIds: string[]
  hitRelevant: number
  hitIrrelevant: number
  precision: number
  recall: number
  mrr: number
  trapHit: boolean
  cost: number
  durationMs: number
  synthesisLen: number
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag)
    if (i < 0) return def
    return argv[i + 1]
  }
  return {
    mode: (get("--mode", "baseline") as Mode),
    pair: get("--pair"),
    csv: get("--csv"),
    topK: Number.parseInt(get("--top-k", "5") ?? "5", 10),
    quiet: argv.includes("--quiet"),
  }
}

function modeFlags(mode: Mode): string[] {
  switch (mode) {
    case "baseline":
      return ["--agent"]
    case "no-synthesis":
      return ["--agent", "--no-speculative-synth"]
    case "max-rounds-1":
      return ["--agent", "--max-rounds", "1"]
    case "max-rounds-4":
      // recall caps max-rounds=2 today; this run will execute as max-rounds=2 but
      // documents the desired knob for km-tribe.recall-deep-rounds.
      return ["--agent", "--max-rounds", "2"]
  }
}

function exec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => (stdout += d.toString()))
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }))
  })
}

async function runRecall(query: string, mode: Mode): Promise<RecallResult | null> {
  // Note: do NOT pass "search" subcommand — recall's default action is search,
  // and the explicit subcommand parser rejects multi-flag invocations.
  const { stdout, code } = await exec("bun", [
    "recall",
    ...modeFlags(mode),
    "--json",
    query,
  ])
  if (code !== 0) return null
  const jsonStart = stdout.indexOf("{")
  if (jsonStart < 0) return null
  try {
    return JSON.parse(stdout.slice(jsonStart)) as RecallResult
  } catch {
    return null
  }
}

function scorePair(pair: Pair, result: RecallResult | null, topK: number): PairScore {
  const hits = result?.results ?? []
  const topK_ids = hits.slice(0, topK).map((h) => (h.sessionId ?? "").slice(0, 8))
  const expectedRelevant = (pair.expected_relevant_session_ids ?? []).map((s) => s.slice(0, 8))
  const expectedIrrelevant = (pair.expected_irrelevant_session_ids ?? []).map((s) => s.slice(0, 8))

  const hitRelevant = topK_ids.filter((id) => expectedRelevant.includes(id)).length
  const hitIrrelevant = topK_ids.filter((id) => expectedIrrelevant.includes(id)).length
  const trapHit = hitIrrelevant > 0

  const precision = topK_ids.length === 0 ? 0 : hitRelevant / topK_ids.length
  const recall = expectedRelevant.length === 0 ? 0 : hitRelevant / expectedRelevant.length

  // MRR: 1 / (1-indexed rank of first relevant)
  let mrr = 0
  for (let i = 0; i < topK_ids.length; i++) {
    const id = topK_ids[i]!
    if (expectedRelevant.includes(id)) {
      mrr = 1 / (i + 1)
      break
    }
  }

  return {
    pairId: pair.id,
    axis: pair.axis,
    query: pair.query,
    topKSessionIds: topK_ids,
    hitRelevant,
    hitIrrelevant,
    precision,
    recall,
    mrr,
    trapHit,
    cost: result?.llmCost ?? 0,
    durationMs: result?.durationMs ?? 0,
    synthesisLen: (result?.synthesis ?? "").length,
  }
}

function fmtTrace(result: RecallResult | null): string[] {
  if (!result) return ["(no result)"]
  const lines: string[] = []
  lines.push(`Query: "${result.query}"`)
  lines.push(`Cost: $${(result.llmCost ?? 0).toFixed(4)}  Duration: ${result.durationMs ?? "?"}ms`)
  // recall agent's trace shape (vendor/bearly/plugins/recall): planner output, fanout stats, etc.
  // We render whatever's there; shape may evolve.
  if (result.trace) {
    lines.push(`Trace:`)
    const traceStr = JSON.stringify(result.trace, null, 2).split("\n")
    for (const t of traceStr.slice(0, 30)) lines.push(`  ${t}`)
    if (traceStr.length > 30) lines.push(`  ... (${traceStr.length - 30} more lines)`)
  }
  const top = (result.results ?? []).slice(0, 5)
  if (top.length) {
    lines.push(`Top ${top.length} hits:`)
    for (const [i, hit] of top.entries()) {
      const sid = (hit.sessionId ?? "?").slice(0, 8)
      const rank = hit.rank !== undefined ? hit.rank.toFixed(3) : "?"
      const snippet = (hit.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
      lines.push(`  [${i + 1}] rank=${rank} ${hit.type}@${sid}: ${snippet}…`)
    }
  }
  if (result.synthesis) {
    lines.push(`Synthesis: ${result.synthesis.slice(0, 300)}${result.synthesis.length > 300 ? "…" : ""}`)
  }
  return lines
}

function fmtScore(score: PairScore): string {
  const verdict = score.trapHit ? "TRAP HIT" : score.hitRelevant > 0 ? "PASS" : "MISS"
  return `[${score.axis}] ${score.pairId} → ${verdict}  P=${score.precision.toFixed(2)} R=${score.recall.toFixed(2)} MRR=${score.mrr.toFixed(2)} (${score.hitRelevant}/${score.hitRelevant + score.hitIrrelevant} of top-K relevant)`
}

async function main(): Promise<void> {
  const { mode, pair: pairFilter, csv, topK, quiet } = parseArgs()

  const corpusText = await readFile(CORPUS_PATH, "utf8")
  const corpus = yaml.parse(corpusText) as Corpus

  let pairs = corpus.pairs
  if (pairFilter) pairs = pairs.filter((p) => p.id === pairFilter)
  if (pairs.length === 0) {
    console.error(`No pairs match (filter: ${pairFilter ?? "none"})`)
    process.exit(1)
  }

  console.log(`recall-eval — mode=${mode} pairs=${pairs.length} topK=${topK}`)
  console.log(`corpus: ${CORPUS_PATH}`)
  console.log("")

  const scores: PairScore[] = []
  for (const pair of pairs) {
    if (!quiet) {
      console.log(`${"=".repeat(70)}`)
      console.log(`Pair ${pair.id} [axis ${pair.axis}]`)
      console.log(`Query: "${pair.query}"`)
      console.log(`Expected relevant: ${(pair.expected_relevant_session_ids ?? []).join(", ") || "(none)"}`)
      console.log(`Expected irrelevant: ${(pair.expected_irrelevant_session_ids ?? []).join(", ") || "(none)"}`)
      console.log("")
    }

    const result = await runRecall(pair.query, mode)
    const score = scorePair(pair, result, topK)
    scores.push(score)

    if (!quiet) {
      for (const line of fmtTrace(result)) console.log(line)
      console.log("")
      console.log(fmtScore(score))
      console.log("")
    } else {
      console.log(fmtScore(score))
    }
  }

  // Aggregate
  console.log(`${"=".repeat(70)}`)
  console.log(`AGGREGATE — mode=${mode} pairs=${scores.length} topK=${topK}`)
  console.log("")
  const meanPrecision = scores.reduce((s, x) => s + x.precision, 0) / scores.length
  const meanRecall = scores.reduce((s, x) => s + x.recall, 0) / scores.length
  const meanMrr = scores.reduce((s, x) => s + x.mrr, 0) / scores.length
  const trapHits = scores.filter((s) => s.trapHit).length
  const passes = scores.filter((s) => !s.trapHit && s.hitRelevant > 0).length
  const misses = scores.filter((s) => !s.trapHit && s.hitRelevant === 0).length
  const totalCost = scores.reduce((s, x) => s + x.cost, 0)
  const totalDuration = scores.reduce((s, x) => s + x.durationMs, 0)

  console.log(`Precision@${topK}:    ${meanPrecision.toFixed(3)}`)
  console.log(`Recall@${topK}:       ${meanRecall.toFixed(3)}`)
  console.log(`MRR:                ${meanMrr.toFixed(3)}`)
  console.log(`Pass / Miss / Trap: ${passes} / ${misses} / ${trapHits}`)
  console.log(`Total cost:         $${totalCost.toFixed(4)}`)
  console.log(`Total duration:     ${totalDuration}ms`)

  if (csv) {
    const header = "pairId,axis,mode,topKIds,hitRelevant,hitIrrelevant,precision,recall,mrr,trapHit,cost,durationMs"
    const rows = scores.map((s) =>
      [s.pairId, s.axis, mode, s.topKSessionIds.join("|"), s.hitRelevant, s.hitIrrelevant,
       s.precision.toFixed(3), s.recall.toFixed(3), s.mrr.toFixed(3), s.trapHit, s.cost.toFixed(4), s.durationMs].join(",")
    )
    await writeFile(csv, [header, ...rows].join("\n") + "\n")
    console.log(`CSV written to ${csv}`)
  }
}

main().catch((err) => {
  console.error("recall-eval: error:", err)
  process.exit(1)
})

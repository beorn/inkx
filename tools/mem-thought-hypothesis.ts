#!/usr/bin/env bun
/**
 * mem-thought-hypothesis.ts — Step 1 of the recall-thought ship plan.
 *
 * Bead: km-tribe.recall-step1-hypothesis-test
 *
 * What it does: every cycle, snapshot the active Claude Code session via
 * `bun recall current-brief --json`, extract a synthetic query from the
 * mentioned tokens + last user prompt, run `bun recall --agent --max-rounds 1`,
 * and append a human-readable digest to a log file.
 *
 * What it tests: would mem-thought-shaped emits have been useful in the
 * actual conversation? End-of-day eyeball: out of ~10 emits, count useful
 * vs noise. Kill gate at 0/10; proceed at 3+/10.
 *
 * NO architecture investment. No code in silvercode. Just a polling probe
 * that exercises the existing recall agent against a live session.
 *
 * Usage:
 *   bun tools/mem-thought-hypothesis.ts            # one-shot cycle
 *   bun tools/mem-thought-hypothesis.ts --loop     # poll every 5 min
 *   bun tools/mem-thought-hypothesis.ts --interval=180  # custom interval (s)
 *
 * Output: appends to ~/.cache/mem-thought-hypothesis.log (one daily file is
 * enough at this volume). Print summary to stdout each cycle.
 */

import { spawn } from "node:child_process"
import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

const LOG_PATH = join(homedir(), ".cache", "mem-thought-hypothesis.log")
const DEFAULT_INTERVAL_S = 300 // 5 min

type CurrentBrief = {
  sessionId: string
  ageMs: number
  recentMessages: string
  exchangeCount: number
  mentionedPaths: string[]
  mentionedBeads: string[]
  mentionedTokens: string[]
}

type RecallResult = {
  query: string
  synthesis?: string
  results?: {
    type?: string
    sessionId?: string
    sessionTitle?: string | null
    timestamp?: number
    snippet?: string
    rank?: number
  }[]
  llmCost?: number
  durationMs?: number
}

function args() {
  const argv = process.argv.slice(2)
  const loop = argv.includes("--loop")
  const intervalArg = argv.find((a) => a.startsWith("--interval="))
  const intervalS = intervalArg ? Number.parseInt(intervalArg.split("=")[1] ?? "", 10) : DEFAULT_INTERVAL_S
  return { loop, intervalS: Number.isNaN(intervalS) ? DEFAULT_INTERVAL_S : intervalS }
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

async function getBrief(): Promise<CurrentBrief | null> {
  const { stdout, code } = await exec("bun", ["recall", "current-brief", "--json"])
  if (code !== 0) return null
  // The output starts with "$ bun vendor/.../recall.ts current-brief --json" before the JSON.
  // Strip that preamble.
  const jsonStart = stdout.indexOf("{")
  if (jsonStart < 0) return null
  try {
    return JSON.parse(stdout.slice(jsonStart)) as CurrentBrief
  } catch {
    return null
  }
}

/**
 * Build a synthetic query from the brief, rotating focus across cycles so we
 * probe different angles of the conversation instead of repeating the same
 * top-tokens query when the conversation is idle.
 *
 * Returns null if conversation hasn't progressed since last cycle (skip).
 */
type LastCycleState = { exchangeCount: number; lastUserPrompt: string; cycleN: number }
let lastState: LastCycleState | null = null

function lastUserPrompt(brief: CurrentBrief): string {
  const userLines = brief.recentMessages.split("\n").filter((l) => l.startsWith("[USER]"))
  return userLines[userLines.length - 1]?.replace("[USER]", "").trim() ?? ""
}

type QueryPlan = {
  query: string
  strategy: number
  strategyName: string
  rationale: string
}

const STRATEGY_NAMES = [
  "latest-user-prompt",
  "bead+token",
  "top-tokens",
  "path+token",
  "tokens+prompt",
]

function buildQuery(brief: CurrentBrief): QueryPlan | null {
  const userPrompt = lastUserPrompt(brief)

  // Skip-on-no-progress: if exchangeCount AND last user prompt are unchanged,
  // there's nothing new to probe. Save cost + log noise.
  if (
    lastState &&
    lastState.exchangeCount === brief.exchangeCount &&
    lastState.lastUserPrompt === userPrompt
  ) {
    return null
  }

  // Rotate focus across cycles. Each strategy explains what it sampled and why.
  const cycleN = (lastState?.cycleN ?? 0) + 1
  const strategy = cycleN % 5
  const tokens = brief.mentionedTokens.slice(0, 5)
  const trimmedPrompt = userPrompt.length > 100 ? userPrompt.slice(0, 100) : userPrompt

  let query: string
  let rationale: string
  switch (strategy) {
    case 0:
      query = trimmedPrompt || tokens.slice(0, 3).join(" ") || "session"
      rationale = trimmedPrompt
        ? `latest user prompt verbatim (chars=${trimmedPrompt.length})`
        : `no user prompt available — fell back to top-3 tokens [${tokens.slice(0, 3).join(", ")}]`
      break
    case 1: {
      const bead = brief.mentionedBeads[0] ?? ""
      const tok = tokens[0] ?? ""
      query = [bead, tok].filter(Boolean).join(" ") || trimmedPrompt
      rationale = bead
        ? `most-recent bead "${bead}" + most-distinctive token "${tok}"`
        : `no bead mentioned — fell back to user prompt`
      break
    }
    case 2:
      query = tokens.slice(0, 3).join(" ") || trimmedPrompt || "session"
      rationale = tokens.length
        ? `top 3 distinctive tokens from brief: [${tokens.slice(0, 3).join(", ")}]`
        : `no tokens — fell back to prompt`
      break
    case 3: {
      const path = brief.mentionedPaths[0] ?? ""
      const tok = tokens[1] ?? tokens[0] ?? ""
      query = [path, tok].filter(Boolean).join(" ") || trimmedPrompt
      rationale = path
        ? `most-recent file path "${path}" + token "${tok}"`
        : `no path mentioned — fell back to user prompt`
      break
    }
    case 4:
    default:
      query = `${tokens.slice(0, 2).join(" ")} ${trimmedPrompt}`.trim()
      rationale = `top 2 tokens [${tokens.slice(0, 2).join(", ")}] + user prompt (mixed-signal probe)`
      break
  }
  // Final guard: empty → fallback
  if (!query.trim()) {
    query = brief.mentionedBeads[0] ?? "session"
    rationale = `${rationale} → empty after build, hard fallback`
  }

  lastState = { exchangeCount: brief.exchangeCount, lastUserPrompt: userPrompt, cycleN }
  return { query, strategy, strategyName: STRATEGY_NAMES[strategy] ?? "?", rationale }
}

async function runRecallAgent(query: string): Promise<RecallResult | null> {
  const { stdout, code } = await exec("bun", [
    "recall",
    "--agent",
    "--max-rounds",
    "1",
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

function nowIso(): string {
  return new Date().toISOString().replace(/T/, " ").replace(/\..+/, "")
}

let cycleCounter = 1
async function runCycle(): Promise<void> {
  const brief = await getBrief()
  if (!brief) {
    console.error(`[${nowIso()}] cycle ${cycleCounter}: no brief, skipping`)
    return
  }
  const plan = buildQuery(brief)
  if (plan === null) {
    // No conversational progress since last cycle — skip silently.
    // Don't even bump the counter; nothing happened.
    console.error(`[${nowIso()}] cycle ${cycleCounter}: no conversational progress, skipping`)
    return
  }
  const result = await runRecallAgent(plan.query)

  // Tokens that match between the query and a hit's snippet are the FTS
  // signal the human can use to judge "did this match for the right reasons?"
  // We approximate by finding the longest query terms (>3 chars) that appear
  // case-insensitively in the snippet.
  const queryTerms = plan.query
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9_./-]/g, ""))
    .filter((t) => t.length > 3)
  const matchedTerms = (snippet: string): string[] => {
    const s = snippet.toLowerCase()
    return queryTerms.filter((t) => s.includes(t.toLowerCase()))
  }

  // Format the digest
  const lines: string[] = []
  lines.push(`=== ${nowIso()} — cycle ${cycleCounter} ===`)
  lines.push(`Session: ${brief.sessionId.slice(0, 8)}  ageMs=${brief.ageMs}  exchanges=${brief.exchangeCount}`)
  lines.push(`Brief: tokens=[${brief.mentionedTokens.slice(0, 5).join(", ")}] beads=[${brief.mentionedBeads.slice(0, 3).join(", ")}] paths=[${brief.mentionedPaths.slice(0, 2).join(", ")}]`)
  lines.push(`Strategy: ${plan.strategyName} (cycle % 5 = ${plan.strategy}) — ${plan.rationale}`)
  lines.push(`Query: "${plan.query}"`)
  if (!result) {
    lines.push(`(no recall result)`)
  } else {
    lines.push(`Cost: $${(result.llmCost ?? 0).toFixed(4)}  Duration: ${result.durationMs ?? "?"}ms`)
    const top = (result.results ?? []).slice(0, 3)
    if (top.length === 0) {
      lines.push(`(no hits)`)
    } else {
      lines.push(`Top ${top.length} hits (rank = FTS score, matched = which query terms hit the snippet):`)
      for (const [i, hit] of top.entries()) {
        const sid = (hit.sessionId ?? "?").slice(0, 8)
        const kind = hit.type ?? "?"
        const rank = hit.rank !== undefined ? hit.rank.toFixed(3) : "?"
        const snippet = (hit.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 220)
        const matched = matchedTerms(hit.snippet ?? "")
        const matchStr = matched.length ? `matched=[${matched.join(", ")}]` : `matched=[] (incidental token overlap)`
        lines.push(`  [${i + 1}] rank=${rank} ${kind}@${sid} ${matchStr}`)
        lines.push(`      ${snippet}…`)
      }
    }
    if (result.synthesis) {
      const summary = result.synthesis.replace(/\s+/g, " ").trim().slice(0, 800)
      lines.push(`Synthesis: ${summary}`)
    }
  }
  lines.push(`Useful? [ ] yes  [ ] no  [ ] mixed   (eyeball at end of day)`)
  lines.push("")

  const block = lines.join("\n")
  console.log(block)

  await mkdir(dirname(LOG_PATH), { recursive: true })
  await appendFile(LOG_PATH, block + "\n")
  cycleCounter++
}

async function main(): Promise<void> {
  const { loop, intervalS } = args()
  console.log(`mem-thought-hypothesis: log → ${LOG_PATH}`)
  if (loop) {
    console.log(`looping every ${intervalS}s`)
    while (true) {
      await runCycle()
      await new Promise((r) => setTimeout(r, intervalS * 1000))
    }
  } else {
    await runCycle()
  }
}

main().catch((err) => {
  console.error("mem-thought-hypothesis: error:", err)
  process.exit(1)
})

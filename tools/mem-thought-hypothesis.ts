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
 * Build a synthetic query from the brief's distinctive tokens + the most
 * recent user prompt. The recall agent's planner expands it; we just need
 * to give it a salient seed.
 */
function buildQuery(brief: CurrentBrief): string {
  // Take the top 3-5 distinctive tokens (already ranked by rarity in current-brief)
  const tokens = brief.mentionedTokens.slice(0, 4)
  // Grab the last [USER] line from recentMessages if present
  const userLines = brief.recentMessages
    .split("\n")
    .filter((l) => l.startsWith("[USER]"))
  const lastUserLine = userLines[userLines.length - 1]?.replace("[USER]", "").trim() ?? ""
  // Trim to keep query short (planner will expand)
  const trimmedUser = lastUserLine.length > 80 ? lastUserLine.slice(0, 80) : lastUserLine
  if (tokens.length === 0 && !trimmedUser) return brief.mentionedBeads[0] ?? "session"
  if (!trimmedUser) return tokens.join(" ")
  return `${tokens.slice(0, 2).join(" ")} ${trimmedUser}`.trim()
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
  const query = buildQuery(brief)
  const result = await runRecallAgent(query)

  // Format the digest
  const lines: string[] = []
  lines.push(`=== ${nowIso()} — cycle ${cycleCounter} ===`)
  lines.push(`Session: ${brief.sessionId.slice(0, 8)}  ageMs=${brief.ageMs}  exchanges=${brief.exchangeCount}`)
  lines.push(`Query: "${query}"`)
  if (!result) {
    lines.push(`(no recall result)`)
  } else {
    lines.push(`Cost: $${(result.llmCost ?? 0).toFixed(4)}  Duration: ${result.durationMs ?? "?"}ms`)
    const top = (result.results ?? []).slice(0, 3)
    if (top.length === 0) {
      lines.push(`(no hits)`)
    } else {
      lines.push(`Top ${top.length} hits:`)
      for (const [i, hit] of top.entries()) {
        const sid = (hit.sessionId ?? "?").slice(0, 8)
        const kind = hit.type ?? "?"
        const snippet = (hit.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 220)
        lines.push(`  [${i + 1}] ${kind}@${sid}: ${snippet}…`)
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

#!/usr/bin/env bun
/**
 * session-arc.ts — turn-by-turn summarized view of a session.
 *
 * For eval / design work where we need to see how a session built up its
 * context (S_t) but the full JSONL is too big to scan. Each turn is
 * compressed to: user prompt (truncated) + assistant summary (text first
 * line + tool calls list).
 *
 * Usage:
 *   bun tools/session-arc.ts <session-id-prefix>
 *   bun tools/session-arc.ts <session-id-prefix> --max-turns 50
 *   bun tools/session-arc.ts 51f52497 da9990c5 4de4a3ab    # multiple sessions
 */

import { readFile } from "node:fs/promises"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import {
  runInjectDelta,
  createMemorySeenStore,
} from "../vendor/bearly/plugins/recall/src/lib/inject-core.ts"
import { LONG_PROMPT_BYPASS_LENGTH } from "../vendor/bearly/plugins/recall/src/lib/prompt-filter.ts"

// Local extractor — mirrors the regex set in prompt-filter.ts. Keep in sync.
function extractAnchors(text: string): Set<string> {
  const anchors = new Set<string>()
  const collect = (re: RegExp) => {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`
    const global = new RegExp(re.source, flags)
    for (const m of text.matchAll(global)) {
      const token = m[0]?.trim()
      if (!token) continue
      const normalized = token.replace(/^[`"]+|[`"]+$/g, "").toLowerCase()
      if (normalized.length >= 2) anchors.add(normalized)
    }
  }
  for (const r of SALIENCE_RULES) collect(r.re)
  return anchors
}

// Salience regex set — mirror prompt-filter.ts so we can explain WHY each
// prompt passed or failed the salience gate. Keep these in sync if the
// canonical set changes.
const SALIENCE_RULES: { name: string; re: RegExp }[] = [
  { name: "kebab-id", re: /\b[a-z]+(?:-[a-z0-9]+){1,}\b/ },
  {
    name: "path",
    re: /\b[a-zA-Z0-9_./-]*\/[a-zA-Z0-9_./-]+\.[a-z]{1,5}\b|\b(?:tools|packages|apps|hub|docs|vendor)\/[a-zA-Z0-9_./-]+/,
  },
  { name: "backticked", re: /`[^`\n]{2,}`/ },
  { name: "quoted-double", re: /"[^"\n]{4,}"/ },
  { name: "error-class", re: /\b[A-Z][a-zA-Z]+(?:Error|Exception|Warning|Bug|Failure)\b/ },
  { name: "scoped-pkg", re: /@[a-z0-9-]+\/[a-z0-9-]+/ },
]

interface SalienceExplain {
  length: number
  bypassed: boolean
  rules: { name: string; matched: boolean; sample?: string }[]
  verdict: "salient" | "low_salience" | "short" | "trivial" | "slash" | "empty"
  reason: string
}

const TRIVIAL = new Set([
  "yes", "no", "y", "n", "ok", "okay", "sure", "continue", "go ahead",
  "lgtm", "looks good", "do it", "proceed", "thanks", "thank you", "done",
  "sounds good", "go for it",
])

function explainSalience(prompt: string): SalienceExplain {
  const length = prompt.length
  const trimmed = prompt.trim()
  if (!trimmed) return { length, bypassed: false, rules: [], verdict: "empty", reason: "empty prompt" }
  if (trimmed.length < 15) return { length, bypassed: false, rules: [], verdict: "short", reason: `length ${length} < 15` }
  if (TRIVIAL.has(trimmed.toLowerCase())) return { length, bypassed: false, rules: [], verdict: "trivial", reason: "matched trivial-prompts list" }
  if (trimmed.startsWith("/")) return { length, bypassed: false, rules: [], verdict: "slash", reason: "starts with /" }

  const rules = SALIENCE_RULES.map((r) => {
    const m = prompt.match(r.re)
    return { name: r.name, matched: !!m, sample: m?.[0] }
  })

  const bypassed = length >= LONG_PROMPT_BYPASS_LENGTH
  const anyMatch = rules.some((r) => r.matched)

  if (anyMatch) {
    const hits = rules.filter((r) => r.matched).map((r) => `${r.name}:${r.sample}`).join(", ")
    return { length, bypassed, rules, verdict: "salient", reason: `matched [${hits}]` }
  }
  if (bypassed) {
    return { length, bypassed, rules, verdict: "salient", reason: `length ${length} >= ${LONG_PROMPT_BYPASS_LENGTH} (long-prompt bypass)` }
  }
  return { length, bypassed, rules, verdict: "low_salience", reason: `length ${length} < ${LONG_PROMPT_BYPASS_LENGTH} and no salience pattern matched` }
}

const PROJECT_DIR = "/Users/beorn/.claude/projects/-Users-beorn-Code-pim-km"

interface JsonlRecord {
  type?: string
  message?: {
    content?: unknown
    role?: string
  }
  uuid?: string
  parentUuid?: string
  timestamp?: string
}

function squish(s: string, max: number = 110): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max)
}

function isMetaPrompt(text: string): boolean {
  const head = text.trimStart()
  return (
    /^<channel|^<system-reminder|^<command-message|^<task-notification|^<user-prompt-submit-hook|^<local-command|^\[Request|^SessionStart:/.test(head) ||
    /^Base directory for this skill:/.test(head) ||
    /^Caveat: The messages below were generated/.test(head) ||
    /^# /.test(head) // skill-loaded markdown (starts with header)
  )
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const item of content) {
      if (typeof item === "string") parts.push(item)
      else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        if (obj.type === "text" && typeof obj.text === "string") parts.push(obj.text)
        else if (typeof obj.text === "string") parts.push(obj.text)
      }
    }
    return parts.join(" ")
  }
  return ""
}

function extractToolUses(content: unknown): { name: string; brief: string }[] {
  if (!Array.isArray(content)) return []
  const tools: { name: string; brief: string }[] = []
  for (const item of content) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>
      if (obj.type === "tool_use" && typeof obj.name === "string") {
        const input = (obj.input ?? {}) as Record<string, unknown>
        let brief = ""
        if (obj.name === "Bash") {
          brief = String(input.description ?? input.command ?? "").slice(0, 60)
        } else if (obj.name === "Edit" || obj.name === "Write" || obj.name === "Read") {
          const fp = String(input.file_path ?? "")
          brief = fp.replace("/Users/beorn/Code/pim/km/", "").replace("/Users/beorn/", "~/").slice(0, 60)
        } else if (obj.name === "Agent" || obj.name === "Task") {
          brief = String(input.description ?? input.subagent_type ?? "").slice(0, 60)
        } else if (obj.name === "Grep" || obj.name === "Glob") {
          brief = String(input.pattern ?? input.query ?? "").slice(0, 60)
        } else if (obj.name?.toString().includes("tribe_send")) {
          brief = `→${input.to ?? "?"}: ${String(input.message ?? "").slice(0, 50)}`
        } else {
          brief = JSON.stringify(input).slice(0, 60)
        }
        tools.push({ name: obj.name as string, brief })
      }
    }
  }
  return tools
}

interface Turn {
  index: number
  userText: string
  asstText: string
  asstTools: { name: string; brief: string }[]
  // Filled when --with-recall is passed
  recall?: {
    skipped: boolean
    reason?: string
    emitChars?: number
    emitFull?: string
  }
  // Cumulative S_t anchors up to and including this turn
  cumulativeAnchors?: string[]
  // Salience-gate trace (filled with --with-recall)
  salience?: SalienceExplain
}

async function loadSession(sessionPrefix: string): Promise<{ id: string; turns: Turn[] }> {
  const files = await readdir(PROJECT_DIR)
  const file = files.find((f) => f.startsWith(sessionPrefix) && f.endsWith(".jsonl"))
  if (!file) throw new Error(`session not found: ${sessionPrefix}`)
  const path = join(PROJECT_DIR, file)
  const text = await readFile(path, "utf8")
  const records: JsonlRecord[] = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try {
      records.push(JSON.parse(line) as JsonlRecord)
    } catch {
      // skip
    }
  }

  // A real "user" message is the user's typed text — not a synthetic tool_result
  // record (Claude Code emits those as type=user with content array containing
  // {type:"tool_result", ...}). We detect by looking for any tool_result item.
  const isToolResultUser = (content: unknown): boolean => {
    if (!Array.isArray(content)) return false
    return content.some(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "tool_result",
    )
  }

  const turns: Turn[] = []
  let currentUser: string | null = null
  let currentAsstText: string[] = []
  let currentTools: { name: string; brief: string }[] = []
  let turnIndex = 0

  const flushTurn = () => {
    if (currentUser !== null) {
      turnIndex++
      turns.push({
        index: turnIndex,
        userText: currentUser,
        asstText: currentAsstText.filter((t) => t.trim()).join("\n").trim(),
        asstTools: currentTools,
      })
    }
    currentUser = null
    currentAsstText = []
    currentTools = []
  }

  for (const r of records) {
    if (r.type === "user") {
      // Skip tool-result synthetic-user messages — they're part of the
      // CURRENT turn's assistant flow, not a new user turn.
      if (isToolResultUser(r.message?.content)) continue
      const txt = extractText(r.message?.content).trim()
      if (!txt || isMetaPrompt(txt)) continue
      // New real user prompt — flush the previous turn, start a new one.
      flushTurn()
      currentUser = txt
    } else if (r.type === "assistant" && currentUser !== null) {
      // Accumulate text and tool calls from EVERY assistant record until the
      // next real user prompt. Claude Code emits multiple assistant records
      // per logical turn (one per tool_use round + final text).
      const text = extractText(r.message?.content).trim()
      if (text) currentAsstText.push(text)
      const tools = extractToolUses(r.message?.content)
      currentTools.push(...tools)
    }
  }
  flushTurn()

  return { id: file.replace(".jsonl", ""), turns }
}

function fmtTurn(t: Turn): string {
  const lines: string[] = []
  const userLine = squish(t.userText, 100)
  const asstSummary = squish(t.asstText, 90) || "(no text — tool-only turn)"
  const tools = t.asstTools.length
    ? t.asstTools.slice(0, 6).map((t) => `${t.name}(${t.brief})`).join(", ")
    : ""
  lines.push(`  T${String(t.index).padStart(2, "0")}  user> ${userLine}`)
  if (t.recall) {
    if (t.recall.skipped) {
      lines.push(`       recall: SKIP (${t.recall.reason})`)
    } else {
      lines.push(`       recall: EMIT ${t.recall.emitChars}ch — ${squish(t.recall.emitFull ?? "", 100)}`)
    }
  }
  if (t.cumulativeAnchors && t.cumulativeAnchors.length > 0) {
    const top = t.cumulativeAnchors.slice(0, 6).join(", ")
    const more = t.cumulativeAnchors.length > 6 ? ` +${t.cumulativeAnchors.length - 6}` : ""
    lines.push(`       S_t anchors: ${top}${more}`)
  }
  lines.push(`       asst> ${asstSummary}`)
  if (tools) {
    const more = t.asstTools.length > 6 ? ` +${t.asstTools.length - 6} more` : ""
    lines.push(`       tools: ${squish(tools, 130)}${more}`)
  }
  return lines.join("\n")
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fmtTurnHtml(t: Turn): string {
  const cls = t.recall?.skipped ? "skip" : t.recall ? "emit" : ""

  // Build the salience-gate explanation as a compact tooltip body. Shown on
  // hover over the MEMORY badge so the reader can see exactly what the
  // pipeline computed.
  let salienceTooltip = ""
  let memMarker = ""
  if (t.recall && t.salience) {
    const s = t.salience
    const ruleLines = s.rules.length
      ? s.rules
          .map((r) => `${r.matched ? "✓" : "✗"} ${r.name}${r.matched && r.sample ? `: ${r.sample}` : ""}`)
          .join("\n")
      : "(no rules checked — Stage 0 short-circuit)"
    salienceTooltip = `length=${s.length} bypass=${s.bypassed ? "yes" : "no"}\nrules:\n${ruleLines}\n→ verdict: ${s.verdict} — ${s.reason}`

    if (t.recall.skipped) {
      const reason = t.recall.reason ?? "skip"
      memMarker = `<div class="memory skip" title="${htmlEscape(salienceTooltip)}">MEMORY: skipped (${htmlEscape(reason)})</div>`
    } else {
      memMarker = `<div class="memory emit" title="${htmlEscape(salienceTooltip)}">MEMORY: emitted ${t.recall.emitChars}ch</div>`
    }
  }

  const anchors = t.cumulativeAnchors && t.cumulativeAnchors.length > 0
    ? `<div class="anchors">anchors: ${t.cumulativeAnchors
        .slice(-6)
        .map((a) => `<span class="anchor">${htmlEscape(a)}</span>`)
        .join("")}</div>`
    : ""
  const tools = t.asstTools.length
    ? `<div class="tools">${t.asstTools
        .slice(0, 8)
        .map((tl) => `<span class="tool"><b>${htmlEscape(tl.name)}</b>${tl.brief ? `&nbsp;${htmlEscape(tl.brief)}` : ""}</span>`)
        .join("")}</div>`
    : ""

  const asstFull = t.asstText
  const asstHtml = asstFull
    ? asstFull.length > 300
      ? `<details class="asst"><summary>${htmlEscape(asstFull.slice(0, 300))}…</summary><div class="asst-full">${htmlEscape(asstFull.slice(0, 1200))}${asstFull.length > 1200 ? "…" : ""}</div></details>`
      : `<div class="asst">${htmlEscape(asstFull)}</div>`
    : `<div class="asst muted">tool-only</div>`

  let emitBody = ""
  if (t.recall && !t.recall.skipped && t.recall.emitFull) {
    const raw = t.recall.emitFull
    const bodyMatch = raw.match(/<snippet[^>]*>([\s\S]*?)<\/snippet>/)
    let body = bodyMatch ? bodyMatch[1]!.trim() : raw
    if (body.length > 1500) body = body.slice(0, 1500) + "…"
    emitBody = `<div class="emit-body">${htmlEscape(body)}</div><details class="emit"><summary>raw envelope</summary><pre>${htmlEscape(raw)}</pre></details>`
  }

  // Layout reflects timing: user types → MEMORY hook fires → assistant responds.
  return `<div class="t ${cls}">
<div class="row1"><span class="idx">T${String(t.index).padStart(2, "0")}</span><span class="role-tag user-tag">user</span><span class="user">${htmlEscape(t.userText)}</span></div>
${memMarker}
${emitBody}
<div class="row3"><span class="role-tag asst-tag">asst</span>${asstHtml}${tools}</div>
${anchors}
</div>`
}

function renderHtml(sessions: { id: string; turns: Turn[] }[]): string {
  const sessionBlocks = sessions
    .map((s) => {
      const turnHtml = s.turns.map(fmtTurnHtml).join("\n")
      const emits = s.turns.filter((t) => t.recall && !t.recall.skipped).length
      const skips = s.turns.filter((t) => t.recall && t.recall.skipped).length
      const skipReasons: Record<string, number> = {}
      for (const t of s.turns) {
        if (t.recall?.skipped && t.recall.reason) {
          skipReasons[t.recall.reason] = (skipReasons[t.recall.reason] ?? 0) + 1
        }
      }
      const skipBreakdown = Object.entries(skipReasons)
        .sort((a, b) => b[1] - a[1])
        .map(([r, n]) => `<span class="reason-tag">${htmlEscape(r)}:${n}</span>`)
        .join(" ")
      return `
<section class="session">
  <h2>session ${s.id.slice(0, 36)}</h2>
  <div class="meta">${s.turns.length} turns · ${emits} emits · ${skips} skips · ${skipBreakdown}</div>
  ${turnHtml}
</section>`
    })
    .join("\n")
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>session arc — recall pipeline trace</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1300px; margin: 1em auto; padding: 0 1em; color: #24292e; line-height: 1.35; font-size: 13px; }
  h1 { border-bottom: 2px solid #e1e4e8; padding-bottom: .3em; }
  h2 { background: #f6f8fa; padding: .3em .6em; border-radius: 4px; margin: 1.5em 0 .2em 0; font-family: monospace; font-size: 14px; position: sticky; top: 0; z-index: 5; }
  .meta { color: #586069; font-size: 12px; margin-bottom: .8em; }
  /* Each turn = 2 dense rows */
  .t { border-left: 3px solid #d1d5da; padding: 4px 10px; margin: 2px 0; background: #fafbfc; }
  .t.skip { border-left-color: #d1d5da; }
  .t.emit { border-left-color: #2da44e; background: #f0fdf4; }
  .row1 { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .row3 { padding-left: 0px; margin-top: 4px; color: #424950; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .role-tag { display: inline-block; padding: 0 5px; border-radius: 2px; font-size: 10px; font-family: monospace; flex-shrink: 0; min-width: 32px; text-align: center; }
  .user-tag { background: #dbedff; color: #0969da; }
  .asst-tag { background: #f0f0f0; color: #6a737d; }
  .memory { display: inline-block; margin: 4px 0 4px 38px; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-family: monospace; cursor: help; }
  .memory.skip { background: #f6f8fa; color: #6a737d; border: 1px dashed #d1d5da; }
  .memory.emit { background: #d1f4d1; color: #1a3a23; border: 1px solid #2da44e; font-weight: 600; }
  .idx { font-family: monospace; background: #e1e4e8; padding: 0 5px; border-radius: 2px; font-weight: 600; font-size: 11px; flex-shrink: 0; }
  .badge { padding: 0 6px; border-radius: 2px; font-size: 10px; font-weight: 700; letter-spacing: .2px; flex-shrink: 0; font-family: monospace; }
  .badge.skip { background: #f6f8fa; color: #6a737d; border: 1px solid #d1d5da; }
  .badge.emit { background: #2da44e; color: white; }
  .user { color: #24292e; word-wrap: break-word; }
  .asst { margin: 1px 0; color: #424950; }
  .asst.muted { color: #b0b8c0; font-style: italic; font-size: 11px; }
  details.asst summary { cursor: pointer; color: #424950; }
  details.asst summary::marker { color: #b0b8c0; }
  details.asst .asst-full { margin-top: 4px; padding: 6px 10px; background: #fff; border: 1px solid #d0d7de; border-radius: 3px; white-space: pre-wrap; }
  .tools { margin-top: 2px; }
  .tool { display: inline-block; background: #fff8c5; padding: 0 4px; border-radius: 2px; margin-right: 3px; font-size: 11px; font-family: monospace; color: #735c0f; }
  .tool b { font-weight: 600; }
  .anchors { margin-top: 2px; }
  .anchor { display: inline-block; background: #ddf4ff; color: #0969da; padding: 0 4px; border-radius: 2px; font-size: 10px; font-family: monospace; margin-right: 2px; }
  .emit-body { margin-top: 4px; padding: 6px 10px; background: #fff; border: 1px solid #c5e8c8; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 11.5px; color: #1a3a23; white-space: pre-wrap; word-break: break-word; }
  details.emit { margin-top: 3px; font-size: 10px; }
  details.emit summary { cursor: pointer; color: #6a737d; font-weight: 400; font-size: 10px; }
  details.emit pre { background: #f6f8fa; border: 1px solid #d0d7de; padding: 5px; border-radius: 2px; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto; font-size: 10px; margin-top: 3px; color: #6a737d; }
  .reason-tag { display: inline-block; background: #fff8c5; padding: 0 5px; border-radius: 2px; font-size: 11px; font-family: monospace; margin: 0 3px; }
  code { font-size: 12px; }
</style>
</head><body>
<h1>recall pipeline turn-by-turn trace</h1>
<p>For each user prompt, the trace shows: pipeline decision (SKIP/EMIT + reason), the cumulative S_t anchors that had built up, the assistant's response summary, and any emit content (expandable).</p>
${sessionBlocks}
</body></html>`
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--max-turns" && argv[i - 1] !== "--html")
  const maxTurns = (() => {
    const i = argv.indexOf("--max-turns")
    return i >= 0 ? Number.parseInt(argv[i + 1] ?? "999", 10) : 999
  })()
  const withRecall = argv.includes("--with-recall")
  const htmlPath = (() => {
    const i = argv.indexOf("--html")
    return i >= 0 ? argv[i + 1] : undefined
  })()

  if (args.length === 0) {
    console.error("usage: session-arc.ts <session-prefix>... [--max-turns N] [--with-recall]")
    process.exit(1)
  }

  const sessionsForHtml: { id: string; turns: Turn[] }[] = []

  for (const prefix of args) {
    try {
      const session = await loadSession(prefix)
      const shown = session.turns.slice(0, maxTurns)

      if (withRecall) {
        // Walk turns with a fresh seen-store, so each turn's recall sees the
        // dedup state that would have built up. S_t anchors accumulate.
        const store = createMemorySeenStore()
        const cumulativeAnchors = new Set<string>()
        for (const t of shown) {
          for (const a of extractAnchors(t.userText)) cumulativeAnchors.add(a)
          t.cumulativeAnchors = Array.from(cumulativeAnchors)
          t.salience = explainSalience(t.userText)
          const r = await runInjectDelta(t.userText, store)
          if (r.skipped) {
            t.recall = { skipped: true, reason: r.reason }
          } else {
            t.recall = {
              skipped: false,
              emitChars: r.additionalContext.length,
              emitFull: r.additionalContext,
            }
          }
        }
      }

      sessionsForHtml.push({ id: session.id, turns: shown })

      if (!htmlPath) {
        console.log(`\n${"=".repeat(72)}`)
        console.log(`session ${session.id.slice(0, 36)}  —  ${session.turns.length} turns`)
        console.log("=".repeat(72))
        for (const t of shown) console.log(fmtTurn(t))
        if (session.turns.length > maxTurns) {
          console.log(`\n  ... (${session.turns.length - maxTurns} more turns truncated)`)
        }
      }
    } catch (err) {
      console.error(`error for ${prefix}:`, err)
    }
  }

  if (htmlPath) {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(htmlPath, renderHtml(sessionsForHtml))
    console.log(`HTML report: ${htmlPath}`)
    console.log(`  ${sessionsForHtml.length} session(s), ${sessionsForHtml.reduce((s, x) => s + x.turns.length, 0)} turns total`)
  }
}

main().catch((err) => {
  console.error("session-arc:", err)
  process.exit(1)
})

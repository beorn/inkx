#!/usr/bin/env bun
/**
 * recall-eval-session.ts — turn-level eval against session-specific labels.
 *
 * For when you want to score the recall pipeline on REAL prompts from a real
 * session (not synthetic corpus pairs), with per-turn expected behavior.
 *
 * Source: hub/tribe/eval/session-labels-<sessionId>.yaml
 *
 * Each labeled turn gets:
 *   prompt              — verbatim user prompt
 *   expected_action     — skip / emit_pointer / emit_inline / needs_s_t
 *   ideal_target        — vault path / bead ID that ANSWERS the prompt
 *   ideal_source        — glossary / vault-fts / session-fts / s_t / tribe / none
 *   notes               — what makes the prompt hard
 *
 * Output:
 *   - per-turn markdown with verdict (correct / false_skip / false_emit)
 *   - aggregate metrics
 *   - HTML report with diff against a previous JSON snapshot (--diff)
 *
 * Usage:
 *   bun tools/recall-eval-session.ts hub/tribe/eval/session-labels-51f52497.yaml
 *   bun tools/recall-eval-session.ts <labels> --html /tmp/eval.html --json /tmp/eval.json
 *   bun tools/recall-eval-session.ts <labels> --diff /tmp/before.json /tmp/after.json
 */

import { readFile, writeFile } from "node:fs/promises"
import yaml from "yaml"
import {
  runInjectDelta,
  createMemorySeenStore,
} from "../vendor/bearly/plugins/recall/src/lib/inject-core.ts"
import type { InjectSkipReason } from "../vendor/bearly/plugins/recall/src/lib/prompt-filter.ts"

type ExpectedAction = "skip" | "emit_pointer" | "emit_inline" | "needs_s_t"
type IdealSource = "glossary" | "vault-fts" | "session-fts" | "s_t" | "tribe" | "none" | "multiple"

interface LabeledTurn {
  turn: number
  prompt: string
  expected_action: ExpectedAction
  ideal_target?: string
  ideal_source?: IdealSource
  notes?: string
}

interface Labels {
  session_id: string
  session_topic?: string
  turns: LabeledTurn[]
}

type Verdict =
  | "correct"            // expected==skip got==skipped, or expected==emit got==emitted
  | "false_skip"         // expected==emit got==skipped
  | "false_emit"         // expected==skip got==emitted
  | "ok_skip_pending"    // expected==needs_s_t got==skipped — acceptable until S_t lands
  | "wrong_target"       // expected==emit got==emitted but content didn't match ideal_target

interface TurnResult {
  turn: LabeledTurn
  finalAction: "skipped" | "emitted"
  skipReason?: InjectSkipReason
  emitContent?: string
  emitChars: number
  durationMs: number
  verdict: Verdict
  matchedIdealTarget?: boolean
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--html" && argv[i - 1] !== "--json" && argv[i - 1] !== "--diff")
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i < 0 ? undefined : argv[i + 1]
  }
  return {
    labelsFile: positional[0],
    html: get("--html"),
    jsonOut: get("--json"),
    diffA: get("--diff"),
    diffB: argv.indexOf("--diff") >= 0 ? argv[argv.indexOf("--diff") + 2] : undefined,
    quiet: argv.includes("--quiet"),
  }
}

function classifyVerdict(turn: LabeledTurn, action: "skipped" | "emitted", emitContent?: string): { verdict: Verdict; targetMatched?: boolean } {
  const expected = turn.expected_action
  if (expected === "skip" && action === "skipped") return { verdict: "correct" }
  if (expected === "skip" && action === "emitted") return { verdict: "false_emit" }

  if (expected === "needs_s_t") {
    return action === "skipped" ? { verdict: "ok_skip_pending" } : { verdict: "false_emit" }
  }

  if ((expected === "emit_pointer" || expected === "emit_inline") && action === "skipped") {
    return { verdict: "false_skip" }
  }

  if ((expected === "emit_pointer" || expected === "emit_inline") && action === "emitted") {
    if (turn.ideal_target && emitContent) {
      // Heuristic: does the emit content mention the ideal target?
      const target = turn.ideal_target.toLowerCase()
      const targetTokens = target.split(/[^a-z0-9-]+/i).filter((t) => t.length > 2)
      const contentLower = emitContent.toLowerCase()
      const matched = targetTokens.length === 0 || targetTokens.some((t) => contentLower.includes(t))
      return { verdict: matched ? "correct" : "wrong_target", targetMatched: matched }
    }
    return { verdict: "correct" }
  }

  return { verdict: "false_skip" }
}

async function evalTurn(turn: LabeledTurn): Promise<TurnResult> {
  const store = createMemorySeenStore()
  const start = Date.now()
  const r = await runInjectDelta(turn.prompt, store)
  const durationMs = Date.now() - start

  const finalAction = r.skipped ? "skipped" : "emitted"
  const emitContent = r.skipped ? undefined : r.additionalContext
  const emitChars = r.skipped ? 0 : r.additionalContext.length
  const skipReason = r.skipped ? r.reason : undefined

  const { verdict, targetMatched } = classifyVerdict(turn, finalAction, emitContent)

  return {
    turn,
    finalAction,
    skipReason,
    emitContent,
    emitChars,
    durationMs,
    verdict,
    matchedIdealTarget: targetMatched,
  }
}

function fmtTurnLine(r: TurnResult): string {
  const verdictBadge = {
    correct: "✓ correct",
    false_skip: "✗ false_skip",
    false_emit: "✗ false_emit",
    ok_skip_pending: "○ ok_skip_pending_s_t",
    wrong_target: "△ wrong_target",
  }[r.verdict]
  const action = r.finalAction === "skipped" ? `skipped(${r.skipReason})` : `emitted ${r.emitChars}ch`
  const expected = r.turn.expected_action
  const target = r.turn.ideal_target ? ` → ${r.turn.ideal_target}` : ""
  return `T${String(r.turn.turn).padStart(2, "0")}  ${verdictBadge.padEnd(22)} expected=${expected}${target}  got=${action}`
}

function aggregate(results: TurnResult[]): {
  total: number
  correct: number
  falseSkip: number
  falseEmit: number
  okSkipPending: number
  wrongTarget: number
  emitRecall: number
  emitPrecision: number
} {
  const total = results.length
  const correct = results.filter((r) => r.verdict === "correct").length
  const falseSkip = results.filter((r) => r.verdict === "false_skip").length
  const falseEmit = results.filter((r) => r.verdict === "false_emit").length
  const okSkipPending = results.filter((r) => r.verdict === "ok_skip_pending").length
  const wrongTarget = results.filter((r) => r.verdict === "wrong_target").length

  const expectedEmits = results.filter(
    (r) => r.turn.expected_action === "emit_pointer" || r.turn.expected_action === "emit_inline",
  ).length
  const correctEmits = results.filter(
    (r) => (r.turn.expected_action === "emit_pointer" || r.turn.expected_action === "emit_inline") && r.verdict === "correct",
  ).length
  const totalEmits = results.filter((r) => r.finalAction === "emitted").length

  return {
    total,
    correct,
    falseSkip,
    falseEmit,
    okSkipPending,
    wrongTarget,
    emitRecall: expectedEmits === 0 ? 1 : correctEmits / expectedEmits,
    emitPrecision: totalEmits === 0 ? 1 : correctEmits / totalEmits,
  }
}

function fmtAggregate(agg: ReturnType<typeof aggregate>): string {
  const lines: string[] = []
  lines.push("")
  lines.push("=".repeat(72))
  lines.push("AGGREGATE")
  lines.push("=".repeat(72))
  lines.push(`Pairs: ${agg.total}`)
  lines.push(`  ✓ correct                ${agg.correct}`)
  lines.push(`  ✗ false_skip             ${agg.falseSkip}  (expected emit, got skip — under-recall)`)
  lines.push(`  ✗ false_emit             ${agg.falseEmit}  (expected skip, got emit — over-emit)`)
  lines.push(`  ○ ok_skip_pending_s_t   ${agg.okSkipPending}  (acceptable today; needs S_t feature to fix)`)
  lines.push(`  △ wrong_target           ${agg.wrongTarget}  (emitted but content didn't reach ideal target)`)
  lines.push("")
  lines.push(`Emit recall:    ${agg.emitRecall.toFixed(2)}  (correct emits / expected emits)`)
  lines.push(`Emit precision: ${agg.emitPrecision.toFixed(2)}  (correct emits / total emits)`)
  return lines.join("\n")
}

function htmlReport(labels: Labels, results: TurnResult[], agg: ReturnType<typeof aggregate>): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const verdictColor = (v: Verdict) => ({
    correct: "#2da44e",
    false_skip: "#bf8700",
    false_emit: "#c41e3a",
    ok_skip_pending: "#586069",
    wrong_target: "#bf8700",
  }[v])
  const rows = results
    .map((r) => {
      const stripped = r.emitContent ? (() => {
        const m = r.emitContent.match(/<snippet[^>]*>([\s\S]*?)<\/snippet>/)
        return (m ? m[1]!.trim() : r.emitContent).slice(0, 400)
      })() : ""
      return `
<div class="t" style="border-left-color:${verdictColor(r.verdict)};">
  <div class="head">
    <span class="idx">T${String(r.turn.turn).padStart(2, "0")}</span>
    <span class="verdict" style="background:${verdictColor(r.verdict)};">${r.verdict}</span>
    <span class="exp">expected: <b>${r.turn.expected_action}</b>${r.turn.ideal_target ? ` → <code>${escape(r.turn.ideal_target)}</code>` : ""}</span>
    <span class="exp">got: ${r.finalAction === "skipped" ? `<code>skip(${r.skipReason})</code>` : `<code>emit ${r.emitChars}ch</code>`}</span>
  </div>
  <div class="prompt">${escape(r.turn.prompt)}</div>
  ${r.turn.notes ? `<div class="notes">${escape(r.turn.notes.slice(0, 400))}</div>` : ""}
  ${stripped ? `<details class="emit"><summary>emit body (${stripped.length}ch)</summary><pre>${escape(stripped)}</pre></details>` : ""}
</div>`
    })
    .join("\n")
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>session eval — ${labels.session_id}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1300px; margin: 1em auto; padding: 0 1em; font-size: 13.5px; color: #24292e; }
  h1 { border-bottom: 2px solid #e1e4e8; padding-bottom: .3em; }
  .agg { background: #fffbe6; border-left: 4px solid #fab005; padding: 12px 16px; white-space: pre; font-family: monospace; font-size: 12px; margin-bottom: 1.5em; }
  .t { border-left: 3px solid #ddd; padding: 8px 12px; margin: 6px 0; background: #fafbfc; border-radius: 0 4px 4px 0; }
  .head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12px; margin-bottom: 4px; }
  .idx { font-family: monospace; background: #e1e4e8; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
  .verdict { color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 700; font-family: monospace; }
  .exp { color: #586069; font-size: 12px; }
  .prompt { background: #f6f8fa; padding: 6px 10px; border-radius: 3px; margin: 4px 0; font-size: 13px; }
  .notes { color: #6a737d; font-size: 11px; font-style: italic; padding-left: 8px; border-left: 2px solid #e1e4e8; margin: 4px 0; white-space: pre-wrap; }
  details.emit { margin-top: 6px; font-size: 11px; }
  details.emit summary { color: #2da44e; cursor: pointer; font-weight: 600; }
  details.emit pre { background: #fff; border: 1px solid #d0d7de; padding: 6px; white-space: pre-wrap; word-break: break-word; max-height: 250px; overflow: auto; font-size: 10px; margin-top: 4px; border-radius: 3px; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 2px; font-size: 11px; }
</style>
</head><body>
<h1>session eval — ${escape(labels.session_id)}${labels.session_topic ? ` — ${escape(labels.session_topic)}` : ""}</h1>
<div class="agg">${escape(fmtAggregate(agg))}</div>
${rows}
</body></html>`
}

async function runDiff(beforePath: string, afterPath: string): Promise<void> {
  const before = JSON.parse(await readFile(beforePath, "utf8")) as TurnResult[]
  const after = JSON.parse(await readFile(afterPath, "utf8")) as TurnResult[]
  const byId = new Map(before.map((r) => [r.turn.turn, r]))
  let flipped = 0
  let improved = 0
  let regressed = 0
  console.log(`session-eval diff: ${beforePath} → ${afterPath}`)
  console.log("")
  for (const a of after) {
    const b = byId.get(a.turn.turn)
    if (!b) continue
    if (b.verdict !== a.verdict) {
      flipped++
      const wasFail = b.verdict !== "correct" && b.verdict !== "ok_skip_pending"
      const isFail = a.verdict !== "correct" && a.verdict !== "ok_skip_pending"
      if (wasFail && !isFail) improved++
      if (!wasFail && isFail) regressed++
      const direction = wasFail && !isFail ? "↑" : !wasFail && isFail ? "↓" : "→"
      console.log(`T${String(a.turn.turn).padStart(2, "0")} ${direction} ${b.verdict} → ${a.verdict}`)
      console.log(`  prompt: ${a.turn.prompt.slice(0, 80)}`)
    }
  }
  console.log("")
  console.log(`flipped: ${flipped} (${improved} improved, ${regressed} regressed, ${flipped - improved - regressed} lateral)`)
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (args.diffA && args.diffB) {
    await runDiff(args.diffA, args.diffB)
    return
  }
  if (!args.labelsFile) {
    console.error("usage: recall-eval-session.ts <labels.yaml> [--html OUT] [--json OUT] [--diff A B]")
    process.exit(1)
  }
  const text = await readFile(args.labelsFile, "utf8")
  const labels = yaml.parse(text) as Labels

  const results: TurnResult[] = []
  for (const turn of labels.turns) {
    const r = await evalTurn(turn)
    results.push(r)
    if (!args.quiet) console.log(fmtTurnLine(r))
  }
  const agg = aggregate(results)
  console.log(fmtAggregate(agg))

  if (args.html) {
    await writeFile(args.html, htmlReport(labels, results, agg))
    console.log(`\nHTML: ${args.html}`)
  }
  if (args.jsonOut) {
    await writeFile(args.jsonOut, JSON.stringify(results, null, 2))
    console.log(`JSON: ${args.jsonOut}`)
  }
}

main().catch((err) => {
  console.error("recall-eval-session:", err)
  process.exit(1)
})

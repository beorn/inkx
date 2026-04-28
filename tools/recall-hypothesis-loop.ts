#!/usr/bin/env bun
/**
 * recall-hypothesis-loop.ts — multi-turn LLM-guided FTS exploratory search.
 *
 * Bead: km-tribe.recall-deep-rounds
 *
 * Implements the hypothesis-driven inner loop:
 *
 *   Round 1..N:
 *     1. HYPOTHESIS: LLM articulates {facts, events, instructions} about
 *        what the user is asking — ENGRAM cognitive types as used in
 *        cloudi/ADR01 §"Cognitive Memory Types" (semantic / episodic /
 *        procedural). Round 1 from query alone; Round 2+ refines based on
 *        evidence from Round N-1.
 *     2. QUERY: LLM generates the most-discriminating FTS query for the
 *        current hypothesis.
 *     3. SEARCH: bun recall --raw -n 20 --json (FTS only, no agent layer).
 *     4. EVIDENCE+REFINE: LLM scores each snippet (supports/refutes/orthogonal),
 *        updates the hypothesis, and decides whether to stop.
 *     5. Stop on: hypothesis stable for 2 rounds, top-K unchanged, max_rounds=6,
 *        or cost cap.
 *
 * Output: human-readable trace of each round (visible exploration) +
 * final hypothesis + best supporting snippets + cost/latency totals.
 *
 * Usage:
 *   bun tools/recall-hypothesis-loop.ts "did we discuss adopting Letta?"
 *   bun tools/recall-hypothesis-loop.ts --max-rounds 4 "query..."
 *   bun tools/recall-hypothesis-loop.ts --max-cost 0.05 "query..."
 *   bun tools/recall-hypothesis-loop.ts --json "query..."
 */

import { spawn } from "node:child_process"

const MODEL = "claude-haiku-4-5-20251001" // cheap, fast, structured-output reliable
const DEFAULT_MAX_ROUNDS = 4
const DEFAULT_MAX_COST = 0.10 // $
const FTS_TOP_K = 20

/**
 * Hypothesis is shaped as ENGRAM cognitive types — aligned with cloudi/ADR01
 * SemanticCategory: facts (semantic) / events (episodic) / instructions (procedural).
 * See docs/explorations/memory-systems-analysis.md and
 * cloudi/specs/active/ADR01/ADR01-memory-system.md §"Cognitive Memory Types".
 */
type Hypothesis = {
  facts: string[]         // semantic — static knowledge
  events: string[]        // episodic — things that happened
  instructions: string[]  // procedural — how to behave / do things
  confidence: "low" | "medium" | "high"
  notes: string
}

type Snippet = {
  type?: string
  sessionId?: string
  sessionTitle?: string | null
  snippet?: string
  rank?: number
}

type EvidenceJudgement = {
  index: number
  verdict: "supports" | "refutes" | "orthogonal"
  why: string
}

type Round = {
  n: number
  hypothesis: Hypothesis
  query: string
  queryRationale: string
  snippets: Snippet[]
  evidence: EvidenceJudgement[]
  evidenceSummary: string
  shouldStop: boolean
  stopReason?: string
  cost: number
  durationMs: number
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const get = (flag: string, def?: string) => {
    const i = argv.indexOf(flag)
    if (i < 0) return def
    return argv[i + 1]
  }
  const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1]?.startsWith("--max")))
  // Last non-flag arg is the query
  const query = positional[positional.length - 1] ?? ""
  return {
    query,
    maxRounds: Number.parseInt(get("--max-rounds", String(DEFAULT_MAX_ROUNDS)) ?? "", 10) || DEFAULT_MAX_ROUNDS,
    maxCost: Number.parseFloat(get("--max-cost", String(DEFAULT_MAX_COST)) ?? "") || DEFAULT_MAX_COST,
    json: argv.includes("--json"),
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

/**
 * Call the LLM, expect JSON in a fenced code block. Returns { parsed, cost }.
 */
async function llmJson<T>(prompt: string): Promise<{ parsed: T | null; cost: number; durationMs: number; raw: string }> {
  const t0 = Date.now()
  const { stdout, code } = await exec("bun", ["llm", "--model", MODEL, "--json", prompt])
  const durationMs = Date.now() - t0
  if (code !== 0) return { parsed: null, cost: 0, durationMs, raw: stdout }

  // The CLI envelope is a JSON line on stdout with a `file` field. The line
  // starts with `{` but contains nested braces (the original query is echoed
  // back), so we can't naive-regex it. Find the last line starting with `{`
  // that parses as JSON.
  let cost = 0
  let filePath = ""
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (!line.startsWith("{")) continue
    try {
      const env = JSON.parse(line) as { cost?: number; file?: string }
      if (env.file) {
        cost = env.cost ?? 0
        filePath = env.file
        break
      }
    } catch {
      /* try next */
    }
  }
  if (!filePath) return { parsed: null, cost, durationMs, raw: stdout }

  const text = await Bun.file(filePath).text()
  // Extract first JSON object/array from a fenced code block, or fall back to braces.
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  const candidate = fenced ? fenced[1]! : text
  const objStart = candidate.indexOf("{")
  const arrStart = candidate.indexOf("[")
  const start = objStart >= 0 && (arrStart < 0 || objStart < arrStart) ? objStart : arrStart
  if (start < 0) return { parsed: null, cost, durationMs, raw: text }
  // Find matching close — naive but works for non-nested LLM output usually.
  // Try to parse from start to end, walking back if needed.
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end).trim()
    if (!slice.endsWith("}") && !slice.endsWith("]")) continue
    try {
      const parsed = JSON.parse(slice) as T
      return { parsed, cost, durationMs, raw: text }
    } catch {
      /* try shorter */
    }
  }
  return { parsed: null, cost, durationMs, raw: text }
}

/**
 * Tier-1 project context: cheap, dynamic, disambiguates "our/we/today" without
 * over-anchoring. Includes: branch, recent commits, claimed beads, session ID +
 * age, brief's mentioned beads/paths/tokens.
 *
 * Excluded: conversation transcript (over-anchors LLM to current-vocabulary;
 * defeats the purpose of recall, which is surfacing forgotten material).
 *
 * NOTE (2026-04-28): this multi-source aggregator (git + bd + bun recall) is a
 * TEMPORARY scaffold. Long-term, when km absorbs cloudi/ADR01's statement
 * substrate (see hub/tribe/design/recall-cloudi-reconciliation.md and
 * docs/future/brain.md), all activity sources — commits, beads, tribe peer
 * activity, file edits — ingest as Statements with cognitive types. Then this
 * function collapses to a single `memory.recall({ scope: "active-session" })`
 * call instead of N tool-specific dispatches. Currently we shim each source.
 */
async function getProjectContext(): Promise<string> {
  const [branchRes, commitsRes, beadsRes, briefRes] = await Promise.all([
    exec("git", ["branch", "--show-current"]),
    exec("git", ["log", "--oneline", "-5"]),
    exec("bd", ["list", "--status", "in_progress", "--limit", "5"]),
    exec("bun", ["recall", "current-brief", "--json"]),
  ])

  const branch = (branchRes.stdout || "(unknown)").trim()

  const commits = commitsRes.stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, 5)
    .map((l) => `  - ${l.trim()}`)
    .join("\n")

  const inProgressBeads = beadsRes.stdout
    .split("\n")
    .filter((l) => l.includes("◐") || l.includes("●"))
    .slice(0, 5)
    .map((l) => `  - ${l.trim()}`)
    .join("\n")

  let sessionId = "(unknown)"
  let ageMs = 0
  let mentionedBeads: string[] = []
  let mentionedPaths: string[] = []
  let mentionedTokens: string[] = []
  if (briefRes.code === 0) {
    const jsonStart = briefRes.stdout.indexOf("{")
    if (jsonStart >= 0) {
      try {
        const brief = JSON.parse(briefRes.stdout.slice(jsonStart)) as {
          sessionId?: string
          ageMs?: number
          mentionedBeads?: string[]
          mentionedPaths?: string[]
          mentionedTokens?: string[]
        }
        sessionId = (brief.sessionId ?? "(unknown)").slice(0, 8)
        ageMs = brief.ageMs ?? 0
        mentionedBeads = brief.mentionedBeads ?? []
        mentionedPaths = brief.mentionedPaths ?? []
        mentionedTokens = brief.mentionedTokens ?? []
      } catch {
        /* keep defaults */
      }
    }
  }

  const ageMin = Math.round(ageMs / 60000)

  return `PROJECT CONTEXT (use to disambiguate "our/we/today"; do NOT use as a query bias):

- Repo: km (Knowledge Machine, TS/Bun/Silvery TUI for knowledge work)
- Current branch: ${branch}
- Active session: ${sessionId} (age ~${ageMin} min)
- Recent commit subjects (oldest → newest):
${commits || "  (no commits)"}
- Open beads marked in_progress in this repo:
${inProgressBeads || "  (none)"}
- Beads mentioned in this session's recent traffic: [${mentionedBeads.slice(0, 6).join(", ")}]
- Files touched in this session: [${mentionedPaths.slice(0, 5).join(", ")}]
- Distinctive tokens this session: [${mentionedTokens.slice(0, 8).join(", ")}]

When the user says "our plan" / "we" / "today" / "this session", they refer to the work in this active session. When they say "previously" / "last week" / "older", they mean session history NOT in the above list — search history-first.`
}

async function fts(query: string, n: number): Promise<{ snippets: Snippet[]; durationMs: number }> {
  const t0 = Date.now()
  const { stdout, code } = await exec("bun", ["recall", "--raw", "-n", String(n), "--json", query])
  const durationMs = Date.now() - t0
  if (code !== 0) return { snippets: [], durationMs }
  const jsonStart = stdout.indexOf("{")
  if (jsonStart < 0) return { snippets: [], durationMs }
  try {
    const parsed = JSON.parse(stdout.slice(jsonStart)) as { results?: Snippet[] }
    return { snippets: parsed.results ?? [], durationMs }
  } catch {
    return { snippets: [], durationMs }
  }
}

function trimSnippet(s: string, max = 200): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max)
}

async function formHypothesisAndQuery(
  userQuery: string,
  prevHypothesis: Hypothesis | null,
  prevEvidenceSummary: string | null,
  roundN: number,
  projectContext: string,
): Promise<{ hypothesis: Hypothesis; query: string; queryRationale: string; cost: number; durationMs: number }> {
  const isFirst = roundN === 1
  const prompt = isFirst
    ? `You are a memory-recall agent doing iterative exploratory search over a Claude Code session-history FTS index.

${projectContext}

User asked: "${userQuery}"

Form a hypothesis about what they're looking for, using ENGRAM cognitive types (the categories cloudi/ADR01 uses):
- facts (semantic): static knowledge — "X is Y", "the API is Z"
- events (episodic): things that happened — "we shipped X on date D", "discussion happened about Y"
- instructions (procedural): how-to / rules — "to deploy run X", "always confirm before sending"
- confidence: your initial confidence (low|medium|high)
- notes: brief reasoning

Then generate the SINGLE most-discriminating FTS query.

QUERY RULES (critical for FTS5 substrate):
- 1 to 3 tokens MAX. Never more than 3.
- Prefer rare distinctive tokens (kebab-case identifiers, proper nouns, error strings) over common words.
- Do NOT stack qualifiers ("plan structure design rationale criteria") — FTS5 ANDs them and returns 0.
- If unsure, ONE highly-specific token beats three generic ones.

Return ONLY this JSON, no prose:
\`\`\`json
{
  "hypothesis": {
    "facts": ["fact1", "fact2"],
    "events": ["event1"],
    "instructions": [],
    "confidence": "medium",
    "notes": "..."
  },
  "query": "rare-token1",
  "query_rationale": "why this query discriminates"
}
\`\`\``
    : `You are a memory-recall agent on round ${roundN} of iterative exploratory search.

${projectContext}

User originally asked: "${userQuery}"

Previous hypothesis: ${JSON.stringify(prevHypothesis)}
Evidence summary from previous round: ${prevEvidenceSummary}

Refine the hypothesis based on what the evidence revealed. Hypothesis uses ENGRAM cognitive types (the categories cloudi/ADR01 uses):
- facts (semantic): static knowledge — confirmed/added/dropped from prior round
- events (episodic): things that happened — fill in timeline as evidence reveals it
- instructions (procedural): how-to / rules — clarify based on evidence

Keep the same JSON shape.

Then generate a NEW FTS query targeting whatever the previous round's evidence suggested needed deeper investigation. Avoid repeating the previous query verbatim.

QUERY RULES (critical for FTS5 substrate):
- 1 to 3 tokens MAX. Never more than 3.
- Prefer rare distinctive tokens (kebab-case identifiers, proper nouns, error strings) over common words.
- Do NOT stack qualifiers ("plan structure design rationale criteria") — FTS5 ANDs them and returns 0.
- If round N-1 returned 0 hits, the previous query was TOO LONG. Drop terms, don't add more.
- If unsure, ONE highly-specific token beats three generic ones.

Return ONLY this JSON, no prose:
\`\`\`json
{
  "hypothesis": { "facts": [...], "events": [...], "instructions": [...], "confidence": "...", "notes": "..." },
  "query": "...",
  "query_rationale": "..."
}
\`\`\``

  const { parsed, cost, durationMs } = await llmJson<{
    hypothesis: Hypothesis
    query: string
    query_rationale: string
  }>(prompt)

  if (!parsed) {
    return {
      hypothesis: { facts: [], events: [], instructions: [], confidence: "low", notes: "(parse failure)" },
      query: userQuery,
      queryRationale: "(LLM parse failure — falling back to user query verbatim)",
      cost,
      durationMs,
    }
  }
  return {
    hypothesis: parsed.hypothesis,
    query: parsed.query,
    queryRationale: parsed.query_rationale,
    cost,
    durationMs,
  }
}

async function evidenceAndRefine(
  userQuery: string,
  hypothesis: Hypothesis,
  snippets: Snippet[],
  projectContext: string,
): Promise<{ evidence: EvidenceJudgement[]; summary: string; shouldStop: boolean; stopReason: string; cost: number; durationMs: number }> {
  const snippetList = snippets
    .slice(0, 10)
    .map((s, i) => `[${i + 1}] (${s.type}@${(s.sessionId ?? "?").slice(0, 8)}) ${trimSnippet(s.snippet ?? "", 250)}`)
    .join("\n")

  const prompt = `You are evaluating evidence in an iterative recall loop.

${projectContext}

ORIGINAL USER QUERY: "${userQuery}"
Current hypothesis: ${JSON.stringify(hypothesis)}

Top-10 FTS snippets retrieved this round:
${snippetList}

For each snippet, decide whether it answers the USER'S ORIGINAL QUERY (not just the hypothesis), then verdict:

- "supports": the snippet is direct, literal evidence about the SPECIFIC THING the user asked about. Test: would showing this snippet to the user genuinely answer their question?
- "refutes": evidence against the hypothesis (rare in retrieval).
- "orthogonal": shares vocabulary or concepts but is about a DIFFERENT thing. Conceptual neighbors get "orthogonal", not "supports" — even if they reuse the same tokens.

CRITICAL precision rule: token-overlap is NOT support. A snippet about "ambient-context-safety adversarial corpus" when the user asked about "the recall eval corpus we built today" shares tokens (corpus, eval) but is about a DIFFERENT corpus. Mark as orthogonal. Use the project context to know which referent the user means.

When in doubt, prefer orthogonal over supports.

Then write a 2-3 sentence summary of what this round revealed about the USER'S query (not just the hypothesis).

Then decide: should we stop the loop? Reasons to stop:
- Strong LITERAL supporting evidence found (≥3 snippets directly answer the user's query)
- All snippets are orthogonal — query was bad, current hypothesis isn't finding the right material; consider reframing in next round (don't stop yet unless we've already tried 2 reframings)
- Refuting evidence rules out the hypothesis

Reasons to CONTINUE (don't stop):
- Snippets are conceptually nearby but none literally answers the query — refine the hypothesis to target the specific thing
- Supports-count is moderate (1-2) — try a sharper query in the next round

Return ONLY this JSON, no prose:
\`\`\`json
{
  "evidence": [
    {"index": 1, "verdict": "supports", "why": "literal answer to user query"},
    {"index": 2, "verdict": "orthogonal", "why": "shares tokens but different referent"},
    ... (up to 10 entries)
  ],
  "summary": "2-3 sentence summary about the USER'S query specifically",
  "should_stop": false,
  "stop_reason": "(empty if continuing, else reason)"
}
\`\`\``

  const { parsed, cost, durationMs } = await llmJson<{
    evidence: EvidenceJudgement[]
    summary: string
    should_stop: boolean
    stop_reason: string
  }>(prompt)

  if (!parsed) {
    return {
      evidence: [],
      summary: "(LLM evidence-eval parse failure)",
      shouldStop: true,
      stopReason: "parse_failure",
      cost,
      durationMs,
    }
  }
  return {
    evidence: parsed.evidence ?? [],
    summary: parsed.summary,
    shouldStop: parsed.should_stop,
    stopReason: parsed.stop_reason,
    cost,
    durationMs,
  }
}

function fmtRound(r: Round, snippets: Snippet[]): string[] {
  const lines: string[] = []
  lines.push(`${"─".repeat(70)}`)
  lines.push(`ROUND ${r.n}`)
  lines.push(`${"─".repeat(70)}`)
  lines.push(``)
  lines.push(`HYPOTHESIS [${r.hypothesis.confidence}]:`)
  lines.push(`  facts:        [${r.hypothesis.facts.join(", ")}]`)
  lines.push(`  events:       [${r.hypothesis.events.join(", ")}]`)
  lines.push(`  instructions: [${r.hypothesis.instructions.join(", ")}]`)
  lines.push(`  notes:        ${r.hypothesis.notes}`)
  lines.push(``)
  lines.push(`QUERY: "${r.query}"`)
  lines.push(`  rationale: ${r.queryRationale}`)
  lines.push(``)
  lines.push(`SEARCH: ${snippets.length} snippets (top 5 shown):`)
  for (let i = 0; i < Math.min(5, snippets.length); i++) {
    const s = snippets[i]!
    const verdict = r.evidence.find((e) => e.index === i + 1)?.verdict ?? "?"
    const why = r.evidence.find((e) => e.index === i + 1)?.why ?? ""
    const flag = verdict === "supports" ? "✓" : verdict === "refutes" ? "✗" : "·"
    lines.push(`  ${flag} [${i + 1}] (${s.type}@${(s.sessionId ?? "?").slice(0, 8)}) ${trimSnippet(s.snippet ?? "", 100)}`)
    if (verdict !== "?") lines.push(`        verdict=${verdict}: ${why}`)
  }
  lines.push(``)
  lines.push(`SUMMARY: ${r.evidenceSummary}`)
  lines.push(``)
  if (r.shouldStop) lines.push(`STOP: ${r.stopReason}`)
  lines.push(`Cost this round: $${r.cost.toFixed(4)}  Duration: ${r.durationMs}ms`)
  lines.push(``)
  return lines
}

async function main(): Promise<void> {
  const { query, maxRounds, maxCost, json } = parseArgs()
  if (!query) {
    console.error(`Usage: bun tools/recall-hypothesis-loop.ts [--max-rounds N] [--max-cost $] [--json] "query"`)
    process.exit(1)
  }

  const trace: Round[] = []
  const allSnippets: Snippet[][] = []
  let totalCost = 0
  let totalDuration = 0
  let prevHypothesis: Hypothesis | null = null
  let prevEvidenceSummary: string | null = null

  // Gather Tier-1 project context once at startup; pass to every LLM call.
  const t0 = Date.now()
  const projectContext = await getProjectContext()
  const ctxDuration = Date.now() - t0
  totalDuration += ctxDuration

  if (!json) {
    console.log(`recall-hypothesis-loop`)
    console.log(`User query: "${query}"`)
    console.log(`Max rounds: ${maxRounds}, max cost: $${maxCost.toFixed(2)}, model: ${MODEL}`)
    console.log(`Project context loaded in ${ctxDuration}ms (${projectContext.length} chars)`)
    console.log(``)
  }

  for (let n = 1; n <= maxRounds; n++) {
    const tRound = Date.now()

    // Step 1+2: form/refine hypothesis + generate query
    const { hypothesis, query: ftsQuery, queryRationale, cost: c1, durationMs: d1 } =
      await formHypothesisAndQuery(query, prevHypothesis, prevEvidenceSummary, n, projectContext)
    totalCost += c1
    totalDuration += d1

    // Step 3: FTS search
    const { snippets, durationMs: d2 } = await fts(ftsQuery, FTS_TOP_K)
    totalDuration += d2

    // Step 4: evidence eval + refine decision
    const { evidence, summary, shouldStop, stopReason, cost: c2, durationMs: d3 } =
      await evidenceAndRefine(query, hypothesis, snippets, projectContext)
    totalCost += c2
    totalDuration += d3

    const round: Round = {
      n,
      hypothesis,
      query: ftsQuery,
      queryRationale,
      snippets,
      evidence,
      evidenceSummary: summary,
      shouldStop,
      stopReason: stopReason || undefined,
      cost: c1 + c2,
      durationMs: Date.now() - tRound,
    }
    trace.push(round)
    allSnippets.push(snippets)
    prevHypothesis = hypothesis
    prevEvidenceSummary = summary

    if (!json) {
      for (const line of fmtRound(round, snippets)) console.log(line)
    }

    if (shouldStop) break
    if (totalCost > maxCost) {
      if (!json) console.log(`STOP: cost cap reached ($${totalCost.toFixed(4)} > $${maxCost.toFixed(2)})`)
      break
    }
  }

  // Aggregate: collect supporting snippets across all rounds, dedupe by (type, sessionId, snippet[:50])
  const supporting: { round: number; index: number; snippet: Snippet; why: string }[] = []
  const seen = new Set<string>()
  for (const r of trace) {
    for (const e of r.evidence) {
      if (e.verdict !== "supports") continue
      const s = r.snippets[e.index - 1]
      if (!s) continue
      const key = `${s.type}@${s.sessionId}@${(s.snippet ?? "").slice(0, 50)}`
      if (seen.has(key)) continue
      seen.add(key)
      supporting.push({ round: r.n, index: e.index, snippet: s, why: e.why })
    }
  }

  if (json) {
    console.log(JSON.stringify({ query, trace, supporting, totalCost, totalDuration, rounds: trace.length }, null, 2))
  } else {
    console.log(`${"═".repeat(70)}`)
    console.log(`FINAL`)
    console.log(`${"═".repeat(70)}`)
    console.log(``)
    const last = trace[trace.length - 1]
    if (last) {
      console.log(`Final hypothesis [${last.hypothesis.confidence}]:`)
      console.log(`  facts:        [${last.hypothesis.facts.join(", ")}]`)
      console.log(`  events:       [${last.hypothesis.events.join(", ")}]`)
      console.log(`  instructions: [${last.hypothesis.instructions.join(", ")}]`)
      console.log(`  notes:        ${last.hypothesis.notes}`)
    }
    console.log(``)
    console.log(`Supporting snippets across ${trace.length} rounds: ${supporting.length}`)
    for (const s of supporting.slice(0, 8)) {
      const sid = (s.snippet.sessionId ?? "?").slice(0, 8)
      console.log(`  R${s.round}.${s.index} (${s.snippet.type}@${sid}): ${trimSnippet(s.snippet.snippet ?? "", 120)}`)
      console.log(`    why: ${s.why}`)
    }
    console.log(``)
    console.log(`Total cost: $${totalCost.toFixed(4)}  Total duration: ${totalDuration}ms  Rounds: ${trace.length}`)
  }
}

main().catch((err) => {
  console.error("recall-hypothesis-loop: error:", err)
  process.exit(1)
})

# Tier 3 — mem thought (recall-thought)

Bead: [`km-tribe.recall-thought`](../../../.beads/issues.jsonl).
Parent: [`km-tribe.recall`](recall-architecture.md) — the four-tier recall epic.

The slow-thinking pattern-matcher. Background process scans the running conversation against the multi-session corpus and surfaces thematic connections async. The "oh wait, that reminds me of..." signal that humans do naturally — and that neither Tier 1 (agent must explicitly ask) nor Tier 2 (only sees one prompt at a time) can cover.

## Where it fits

| Tier | Cognitive mode | Trigger | Latency | State |
|------|---------------|---------|---------|-------|
| 1 lookup  | active recall | Agent calls tool | ~500 ms | ✅ ships as `tribe.ask` |
| 2 inject  | priming | System on every prompt | ~400 ms sync | ⚠️ ships as UserPromptSubmit hook |
| **3 thought** | **reflection / mind-wandering** | **System paced (turns + time)** | **minutes async** | **❌ this design** |
| 4 dream   | offline consolidation | Nightly batch | hours | ❌ separate bead |

## Prior art (what other systems do)

This design is informed by surveying production AI memory systems. None of them implement Tier 3 exactly — most operate at Tier 1 (on-demand) or Tier 2 (always-on injection). The Tier 3 niche is genuinely novel.

### ChatGPT memory (OpenAI)

Two layers:

- **Saved memories**: permanent facts in `Model Set Context` block; injected ONCE at session start
- **Chat-history summary**: rolling summary updated as conversations progress; injected at new chat start

Architectural note: ChatGPT does NOT do per-prompt dynamic retrieval. Pre-injects relevant memory upfront and lets the model use what it sees. **No equivalent to mem-thought** — closest is offline summary update (more like Tier 4).

### Mem0 (production-ready open-source)

- LLM extracts "atomic facts" from conversation, embeds + stores
- Vector + graph hybrid retrieval
- **Trigger: explicit** — agent calls `mem0.search(query)` on demand
- Atomic-fact extraction happens during/after conversation (closer to Tier 4)

**No equivalent to mem-thought** — Mem0 is purely Tier 1 + Tier 4.

### Letta / MemGPT

Tool-call memory paradigm:

- `core_memory` (always in context, small)
- `recall_memory` (full history, search-on-demand)
- `archival_memory` (long-term notes, search-on-demand)

Agent calls `recall_search()` / `archival_search()` as tools. Self-managed: agent decides what to write to which tier.

**No equivalent to mem-thought** — Letta is pure Tier 1 with explicit agent control.

### Cursor (IDE)

Hybrid implicit + explicit:

- **Implicit**: local embeddings index; per-prompt similarity search runs in background; top-K snippets attached automatically
- **Explicit**: `@-mention` for user-directed context

Cursor 2.0 trend: removed `@Web`, `@Git`, `@LinterErrors`, `@RecentChanges` — replaced with agent-driven tool use. Agent calls `git diff`, reads linter, browses web on its own when needed.

**No equivalent to mem-thought** — Cursor is implicit-Tier-2 (always-on per prompt) + explicit-Tier-1.

### Aider (terminal coding agent)

- Tree-sitter extracts symbols from entire repo
- "Repo map" injected on every prompt
- No vector search; relies on model to scan the map

**No equivalent to mem-thought** — Aider sidesteps trigger-decision with always-on static index.

### Self-RAG / Corrective RAG (CRAG) — research

Retrieval gating + post-retrieval critique. Inspiration for confidence-gated retrieval and "retry with alternative query" if utility is low. Could inform our Tier 3 minimum-coverage threshold.

### Reflexion / Experience Replay — research

Label success/failure of past trajectories; prefer successful ones in future recall. Reinforces our outcome-aware ranking design.

### Why mem-thought is novel

Every prior-art system either:
- Asks the agent to drive (Tier 1) — you only get what the agent thinks to ask for
- Injects on every prompt (Tier 2 implicit) — high-frequency, low-precision
- Pre-injects at session start (ChatGPT) — stale across long sessions
- Runs offline batch (Tier 4 / Mem0 atomic facts) — doesn't surface in-session

**None mind-wanders during work.** That's the gap mem-thought fills: a paced, low-frequency, high-quality "while you're working, here's what came up earlier" stream that doesn't depend on the agent asking and doesn't pollute every prompt.

## Pipeline

```
[ Cadence trigger ]
   • Every N turns (default 10) OR every M minutes (default 5)
   • Whichever comes first; reset both counters on emit
   • Skip if already in-flight (one percolation per session at a time)
   │
   ▼
[ Conversation summarizer ]                   ~1–2 s, claude-haiku-4-5
   • Take last K turns (default 12) or full conversation if shorter
   • Compress to: 3–5 bullet points of "what's the conversation about
     + which entities/identifiers came up"
   • Output is grounded — must include actual tokens from the conversation
   │
   ▼ summary
[ Hypothesis planner ]                        ~2–3 s, claude-haiku-4-5
   • Generate 3–5 "what might be relevant from prior sessions?"
     queries grounded in summary tokens
   • Constraint: each query MUST share ≥1 lexical token with the summary
     (no hallucinated topic drift)
   • Drop queries that fail the constraint
   │
   ▼ 3–5 hypothesis queries
[ FTS5 parallel fanout ]                      ~600 ms
   • Same FTS index as Tier 1 (tribe.ask) and Tier 2 (UserPromptSubmit)
   • Coverage rerank: docs hit by ≥2 hypotheses dominate
   • Filter: skip docs already injected in this session (dedupe state)
   • Filter: skip current session's own content (no echo)
   │
   ▼ ranked hits
[ Outcome-aware filter ]
   • Bead status weights:
       RESOLVED:    +1.0
       EXPLORATORY: +0.5
       SUPERSEDED:  +0.3 (label with pointer to canonical)
       REJECTED:    -1.0 (or label as "DON'T DO" warning)
   • Recency: gentle decay only — old RESOLVED beats recent REJECTED
   • Skip emit entirely if total weighted score < threshold (silent on no-signal)
   │
   ▼ filtered hits (or nothing)
[ Synthesis ]                                 ~2–3 s, claude-haiku-4-5
   • One digest paragraph: "While working on X, I noticed sessions
     abc/def discussed similar Y. Worth knowing: <2-3 sentences>."
   • Always includes session/bead pointers (agent can pull full chunk
     via Tier 1 if it wants more)
   • Embeds bead status labels in the synthesis text
   │
   ▼
[ Async emit ]
   • One AmbientEvent, source: recall, kind: thought
   • Header: [mem-thought, cycle N — covering turns X–Y, emitted Zs after start]
   • Body: synthesis paragraph
   • Timestamp shows when cycle STARTED (so the agent knows this is
     looking-backward context, not just-in-time)
```

## Why async is fine here (refuting Kimi's blanket "async breaks causality")

Kimi's argument applies to *async-pretending-to-be-JIT*: a digest fired at trigger time arriving 6 s later, after the agent has already answered. That IS gaslighting.

But mem-thought is **labeled as background**: `[mem-thought, cycle 3 — emitted 47 s after turn 24]`. The agent treats it like memory surfacing later in a conversation, not as a freshly-relevant observation. Framing carries the load. The "observation, not instruction" boundary already neutralizes imperative pressure; mem-thought just extends it across a longer time window.

Compare to human cognition: "Oh wait, that reminds me of something we tried last month." Humans don't panic that this thought arrived "late" — they evaluate whether it's relevant to current discussion and incorporate-or-ignore. The agent does the same.

## Cost & latency

- **Per cycle**: ~5–8 s wall-clock, runs in background (zero impact on user)
- **Per cycle cost**: ~$0.01–0.05 (haiku summarizer + haiku planner + FTS + haiku synth)
- **Cadence ceiling**: 5–10 cycles per session
- **Heavy-use cost**: ~$0.50/session, ~$10–15/dev/month at 4–6 h/day
- **Daily cap**: $1/dev/day default. Above cap, fall back to no-LLM mode (structural-only hypothesis extraction from summary, no planner LLM)

## Failure modes & mitigations

- **Hallucinated queries** — planner constraint: queries must contain ≥1 lexical token from the conversation summary. Drop queries that fail this constraint before fanout.
- **Noise emission** — minimum-coverage threshold: skip emit if no hit covered by ≥2 hypotheses. Silent percolation cycles are fine.
- **Topic drift mid-cycle** — if the conversation moves to a totally different topic mid-percolation, the synthesis arrives stale. Mitigation: header includes "topic at cycle start" so the agent can judge relevance to current topic. Also: cancel in-flight cycle on /clear or major topic shift detection.
- **Cost runaway** — daily cap with structural fallback above cap; per-session cap (5–10 cycles).
- **Re-surfacing rejected work** — outcome-aware ranking + status headers in the synthesis (`Note: prior session rejected this approach`).
- **Re-surfacing same docs** — per-session injection set; skip docs already emitted in any prior mem-thought cycle this session.
- **Conflicts with Tier 2** — Tier 2 (mem inject) emits per-prompt; Tier 3 emits per-cycle. They could surface overlapping content. Mitigation: Tier 3 dedupe checks Tier 2's per-session injection set too (when both are running).

## Implementation

### Module structure

- New: `apps/silvercode/src/ambient-adapters/percolate.ts` — the cadence loop + pipeline orchestrator
- New: `apps/silvercode/src/ambient-adapters/percolate-prompts.ts` — summarizer / planner / synth prompts (separate file so they're easy to tune)
- Reuse: `vendor/bearly/tools/recall.ts` library function for FTS fanout (NOT CLI subprocess)
- Reuse: existing outcome-aware ranking from any shared module (or implement inline; small)
- Reuse: `apps/silvercode/src/ambient-stream.ts` for event emission

### Controller wiring

```typescript
// apps/silvercode/src/controller.ts
import { registerPercolateAdapter } from "./ambient-adapters/percolate.ts"

// In session subscribe loop:
registerPercolateAdapter({
  scope: sessionScope,
  queue: channelQueue,
  sessionId,
  conversationStream: store.subscribe,    // for the rolling K-turn window
  cadence: {
    everyNTurns: 10,
    everyMinutes: 5,
  },
  budget: {
    perSessionCycleCap: 10,
    perDayCostCap: 1.00,  // USD
  },
})
```

### Prompts (sketches)

**Summarizer**:
```
Compress this conversation excerpt to 3-5 bullet points.
Each bullet must mention concrete identifiers (file paths, function names,
bead IDs, error strings, package names) that appear in the text.
Do NOT introduce concepts not present in the text.
```

**Hypothesis planner**:
```
Given this summary of an ongoing coding conversation, generate 3-5 search
queries that might find RELEVANT prior context from past sessions.

Constraints:
- Each query must share ≥1 word with the summary
- Queries should be 2-5 words, no question marks
- Prefer specific over generic ("wrap regression mobile" not "wrap bug")

Return as JSON array of strings.
```

**Synth**:
```
Compose ONE paragraph (2-4 sentences) noting what came up in past sessions
that might be relevant to the current conversation. Format:

"While [current topic], past sessions discussed [thematic connection]:
[bead-id status:RESOLVED] [brief note]; [bead-id status:REJECTED] [warning].
Worth knowing if [conditional relevance hint]."

Be specific, terse, neutral. Don't tell the agent what to do.
```

### Tests

- Unit: cadence trigger fires correctly (turn count, time elapsed)
- Unit: summarizer prompt rejects hallucinations (mock LLM returns content with off-topic tokens; assert filtered)
- Unit: planner constraint enforced (query without summary-overlap is dropped)
- Unit: outcome-aware filter weights applied correctly
- Unit: per-session dedupe set prevents re-emit
- Integration: full pipeline against fixture session-index.db; assert ONE digest emitted with `[mem-thought, ...]` header
- Integration: cancellation on session end leaves no orphan in-flight LLM calls
- Smoke: live cycle against real corpus, paste digest content (with status labels) in test output

### Telemetry (loggily `silvercode:ambient`)

```
percolate:cycle-start  { sessionId, turnsCovered, summary }
percolate:cycle-emit   { sessionId, hitCount, statuses[], cost, durationMs }
percolate:cycle-skip   { sessionId, reason: "in-flight" | "no-coverage" | "cost-cap", durationMs }
percolate:cost         { sessionId, cycleN, costUsd, model }
```

## Acceptance gates

- `npx tsc --noEmit` non-vendor: 0 errors
- `bun vitest run apps/silvercode/tests/ambient-adapters/percolate`: all pass
- `bun tools/check-prompt-boundary.ts`: clean (sanity)
- Smoke test: dogfood for 1 session of normal silvercode work; observe at least 2 successful percolation events with `[mem-thought, ...]` headers; verify zero `[REJECTED]`-status content surfaces without DON'T-DO label
- Cost ceiling: cycle costs total < $0.50 per dogfood session
- No user-facing latency tail (verify by timing user prompts before vs after percolation enabled)

## Correction (2026-04-27 23:35): recallAgent IS the design. Tier 2 deferred = more budget.

Two course corrections from the user:

**1. We already designed this.** `recallAgent` (in `vendor/bearly/plugins/recall/src/lib/agent.ts`) does 2 rounds of LLM-refined FTS searches. I incorrectly called it "one-shot" — actually round 2's `planQuery` receives `priorPlan`, `priorResults`, `priorVariants` as input and generates new variants based on what round 1 found. That's iterative LLM refinement. Already shipped. Already battle-tested via `bun recall --agent`.

**2. Tier 2 is deferred → mem-thought has the whole budget.** My earlier cost-discipline math (~$2–5/mo, 3 cycles/session cap) was constrained by "Tier 2 also runs every prompt." With Tier 2 deferred, mem-thought can be:
- More cycles per session (e.g., 5–10 instead of 3)
- More cadence-frequent (every 10–15 turns instead of 25)
- Full 2-round mode (not capped at maxRounds: 1)
- ~$0.05–0.15/session, ~$10–20/dev/month at heavy use — fine

### Simpler v1: pace recallAgent against the conversation

Since recallAgent already does 2-round LLM-refined FTS, mem-thought is just **paced invocation of recallAgent against the running conversation**:

```
[ Cadence trigger ]              every 10–15 turns OR 15 min, idle ≥10s
   • cap 5–10 cycles/session (not 3 — Tier 2 isn't competing)
   │
   ▼
[ Synthetic query from conversation ] 1 cheap LLM call (~1s, ~$0.001)
   • Input: last 4–6 raw turns
   • Prompt: "What 1–3 word query would surface relevant prior context?"
   • JSON-validated to contain ≥1 token from the conversation
   • Falls back to top-anchor extraction if LLM fails
   │
   ▼
[ recallAgent(query, { since: '30d', maxRounds: 2 }) ]
   • The existing 2-round LLM-refined FTS pipeline
   • planQuery → fanoutSearch → speculative synth → decide round 2
     → planQuery(round 2, prior context) → fanout → merge → final synth
   • ~6–9 s background, ~$0.01 per call
   │
   ▼
[ Outcome-aware re-rank ]        ~10ms, no LLM
   • Bead status weights from session-index.db metadata
   • Skip if utility < threshold
   │
   ▼
[ Topic-drift gate at emit ]
   • Drop if user sent ≥2 prompts since cycle started
   • Drop on /clear or workspace change
   │
   ▼
[ Templated emit ]
   • [mem-thought, cycle N — query: "<q>", emitted Zs] header
   • Body: recallAgent's synthesis + bead/session pointers
   • Sidecar: { query, beadIds, statuses, cost, durationMs }
```

### Cost & latency

- Per cycle: ~6–9 s background (recallAgent) + ~1 s query builder = 7–10 s, **~$0.011/cycle**
- Per session: 5–10 cycles × $0.011 = ~$0.05–0.11
- Heavy use (4–6 h/day, 2–3 sessions): ~$5–10/dev/month

### Implementation: ~50 LOC + tests

```typescript
// apps/silvercode/src/ambient-adapters/percolate.ts
import { recallAgent } from "@bearly/recall"

export function registerPercolateAdapter(opts: PercolateOpts): () => void {
  const cadence = createCadence({
    everyNTurns: 12,
    everyMinutes: 15,
    idleMs: 10_000,
    capPerSession: 8,
  })

  cadence.onFire(async (turns, cycleN) => {
    const cycleStart = Date.now()
    const query = await buildSyntheticQuery(turns)  // ~1s, ~$0.001
    if (!query) return

    const result = await recallAgent(query, {
      since: "30d",
      maxRounds: 2,
      limit: 5,
      projectFilter: opts.repoScope,
    })

    if (turnsSinceCycleStart() >= 2) return        // topic drifted
    const ranked = applyOutcomeRanking(result.results)
    if (utility(ranked) < THRESHOLD) return         // silent on no-signal

    opts.queue.enqueue(formatThoughtEvent(query, result, ranked, cycleN))
  })

  return () => cadence.dispose()
}
```

That's it. The 2-round LLM-refined FTS browsing the user wants is already inside `recallAgent` — we just feed it conversation-derived queries, gate cadence, apply outcome ranking, and emit.

### When to upgrade to a real tool-call loop (v2+)

The simpler design above wins **if the synthetic-query-from-conversation step produces a good enough seed**. If telemetry shows recallAgent is missing relevant content (low pull-through, high "no useful signal" rate), upgrade to:

- **v2**: Multi-query: build 2–3 synthetic queries from different angles of the conversation, run recallAgent on each in parallel, merge with coverage rerank
- **v3**: True tool-call loop where the LLM examines each round's results and decides what to query next (pure /big pattern). Cost: ~$0.05/cycle. Use only if v1+v2 don't deliver.

Don't build v2/v3 speculatively — measure v1 first.

---

## Final framing (2026-04-27 23:35): "intelligently browse a stupid FTS"

User's framing crystallized the design: **mem-thought is an LLM agent that iteratively browses dumb keyword indexes to find useful stuff.** The intelligence is in the iteration (refine query based on what's found), not in the substrate (FTS5 is fine, it's "stupid" but cheap and reliable).

This is the `/big` / `/complete` pattern: LLM has tools, examines results, decides what to query next, synthesizes when satisfied. NOT the one-shot smart-query-expansion that `recallAgent` already does.

### Two search substrates available

| Substrate | What it indexes | Retrieval | Already exposed as tool? |
|-----------|----------------|-----------|--------------------------|
| **recall** (bearly tribe) | Claude Code session history | FTS5 lexical only; planner does query expansion | ✅ `tribe.ask` MCP tool, `tribe.brief`, `tribe.plan` |
| **qmd** | Markdown knowledge bases (vault, design docs) | Hybrid: BM25 + vector + HyDE + cross-encoder rerank | ✅ `qmd mcp` server |

For coding-agent thematic relevance, **recall (sessions) is the primary substrate**. qmd is secondary — useful for surfacing related vault content, but session history is where most "we tried this before" signal lives. v1 uses recall; qmd extends in v2 if telemetry shows pull-through value.

### The agent loop (final shape)

```
[ Cadence trigger ]                          (same as before: 25 turns OR 15min, idle, cap 3)
   │
   ▼
[ Cheap-LLM agent loop, claude-haiku-4-5 ]   ~10–20s background, ~$0.02–0.05/cycle
   • System prompt: "You are a memory-browser. Given the recent
     conversation, search prior session history for context the
     agent might find useful. You can search up to 5 times. Stop
     when you find something useful or have ruled it out."
   • User content: last 4–6 raw turns
   • Tools available:
       recall_search(query)  → 5 top FTS hits with bead status + snippets
       (optional v2: qmd_query, read_chunk)
   • LLM iterates: search → examine → refine → search → ... → emit-or-skip
   • Output: structured JSON
       { useful: bool, summary: string, beadIds: string[],
         queriesIssued: string[], reason?: "no-signal" | "off-topic" | "stale" }
   │
   ▼ structured result (or "no useful signal" → skip)
[ Outcome-aware filter ]                     ~5ms, no LLM
   • Apply bead status weights to the LLM's chosen results
   • Drop emit if all results are REJECTED status, or utility < threshold
   │
   ▼
[ Topic-drift gate at emit time ]
   • Drop if user sent ≥2 new prompts since cycle started
   • Drop on /clear or workspace change
   │
   ▼
[ Templated emit ]
   • One AmbientEvent, source: recall, kind: thought
   • Header: [mem-thought, cycle N — emitted Zs after start]
   • Body: LLM's summary + bead/session pointers (status-labeled)
   • Sidecar JSON: { queriesIssued, beadIds, statuses, durationMs, cost }
```

### Why the agent loop beats recallAgent for this use case

`recallAgent` (existing): one-shot. Generates 10–29 variants, parallel fanout, optional second round if coverage thresholds say so. Smart **at query expansion**, but doesn't *think about* what it found before deciding next move.

mem-thought agent loop: iterative. After first 1–2 results come back, LLM reasons "ah, this mentions X — maybe X is the actual relevant token, let me search X+Y". The intelligence is at result-examination time, not just plan time.

For "find subtle thematic connections across sessions," iterative wins. For "answer a specific user query as fast as possible" (recall's normal use case), one-shot wins on latency.

### Cost & latency

- Per cycle: ~10–20 s wall-clock (background, zero user impact), 3–6 LLM turns
- Per cycle cost: ~$0.02–0.05 (claude-haiku-4-5 across iterations)
- Per session: 3 cycles × ~$0.03 = ~$0.10 max
- Heavy use (4–6h/day, 2–3 sessions/day): ~$5–10/dev/month

This is **higher than my one-shot wrapper** ($2–3/mo) but the iterative-smart vs one-shot-smart difference is exactly what the user is asking for. Configurable via env vars; user can turn off cycles or cap budget per day.

### Tool definition for the agent loop

```typescript
// recall_search tool the agent calls
{
  name: "recall_search",
  description: "Search prior Claude Code session history. Returns top 5 FTS5 hits with bead status, date, snippet. Use this to find prior context that might be useful to the agent's current task. You can call this up to 5 times in this cycle.",
  parameters: {
    query: { type: "string", required: true,
             description: "FTS5-style query — keywords, phrases, identifiers" },
    since: { type: "string", optional: true,
             description: "Time filter, e.g. '7d' or '30d' (default 30d)" },
  },
  // Returns: [{ sessionId, beadId?, status?, date, snippet }, ...]
}
```

Implementation: thin wrapper around `recall()` from `@bearly/recall` library (NOT the recallAgent — we want raw FTS hits, not a synthesized answer). Fast (~600 ms per call).

### What this preserves vs prior iterations

| Concern | Preserved how |
|---------|--------------|
| Causality (Kimi) | Topic-drift gate at emit; cycle is async-labeled in header |
| Outcome-aware ranking (all /pro) | Filter applied after LLM's pick, before emit |
| Cross-session lane (Kimi) | recall_search filters out current session by default |
| Hard cycle cap (Kimi) | 3/session enforced before agent loop fires |
| LLM intelligence (user) | The whole loop is intelligence; ground truth is raw turns + raw FTS hits |
| Stable ground truth (vs telephone game) | Each LLM turn sees raw turns + raw search results — no compounding distillation |
| Cost discipline | Per-cycle budget cap on total LLM tokens (~5 tool-call rounds max) |

### Implementation sketch

```typescript
// apps/silvercode/src/ambient-adapters/percolate.ts
import { recall } from "@bearly/recall"  // raw FTS function, not recallAgent
import { runAgentLoop } from "./percolate-agent.ts"

export function registerPercolateAdapter(opts: PercolateOpts): () => void {
  const cadence = createCadence({
    everyNTurns: 25,
    everyMinutes: 15,
    idleMs: 10_000,
    capPerSession: 3,
  })

  cadence.onFire(async (turns, cycleN) => {
    if (alreadyInFlight) return
    const cycleStart = Date.now()

    const result = await runAgentLoop({
      turns,
      tools: { recall_search: makeRecallSearchTool(opts.repoScope, opts.currentSessionId) },
      maxToolCalls: 5,
      llmOptions: { model: "claude-haiku-4-5", maxTokens: 1500 },
    })

    // Topic-drift gate
    if (turnsSinceCycleStart() >= 2 || clearWasPressed) return
    // Utility gate
    const ranked = applyOutcomeRanking(result.beadIds, result.statuses)
    if (utility(ranked) < THRESHOLD) return

    opts.queue.enqueue(formatThoughtEvent(result, cycleN))
  })

  return () => cadence.dispose()
}
```

`runAgentLoop` is ~80 lines (Anthropic SDK tool-use loop, standard pattern). `makeRecallSearchTool` is ~20 lines.

Total new code: ~150 LOC + tests.

---

## Reality check (2026-04-27 23:30): how `recall --agent` actually works

Before going further with abstract design, I read the actual implementation in `vendor/bearly/plugins/recall/src/lib/agent.ts`. The shipped pipeline is **smart-query-expansion + parallel search + speculative synth** — not a tool-call agent loop. Concrete shape:

```
recallAgent(query, options) — vendor/bearly/plugins/recall/src/lib/agent.ts
   │
   ▼
[ buildQueryContext() ]               cached by db mtime
   • Recent sessions, recent beads, rare vocabulary tokens
   • The "context bundle" the planner sees
   │
   ▼
[ Round 1 planQuery(query, context) ] 1 LLM call (~2–4s)
   • One-shot generation of 10–29 FTS5 query variants
   • Returns: keywords, phrases, paths, bead IDs, time hints
   │
   ▼
[ fanoutSearch(variants) ]            parallel FTS5 (~600ms)
   • All variants run in parallel
   • Coverage rerank: docs hit by ≥N variants dominate
   │
   ▼ round-1 results
[ Speculative synth ]                 ~2–3s, race-of-2 LLMs
   • FIRES IN PARALLEL with round-2 planning
   • If round 2 doesn't add ≥2 new top-K docs → use this answer (saves ~3s)
   │
   ▼ (concurrent with)
[ Decide round 2 ]                    rule-based, no LLM
   • SHORT_CIRCUIT_COVERAGE_FRACTION = 0.35
   • SHORT_CIRCUIT_COVERAGE_ABSOLUTE = 6
   • Modes: off / wider / deeper / auto
   │
   ▼ (if needed)
[ Round 2 planQuery(mode, prior) ]    1 LLM call
[ fanoutSearch(NEW variants) ]        excludes round-1 variants
[ mergeFanouts ]                      coverage rerank merged
   │
   ▼ final results
[ Synthesis ]                         either speculative OR fresh-merged
   • race-of-2 (gpt-5-nano + claude-haiku-4-5)
   • Returns: text answer + cost
```

**Total cost per call**: ~$0.01 (planner haiku + speculative synth haiku + fresh-merged synth haiku if needed)
**Total latency**: ~6–9 s end-to-end, often short-circuited at round 1 to ~4–5 s
**Existing speculative synth saves ~3s when round 1 is "good enough"**

### Implications for mem-thought

The existing `recallAgent` is **already** the smart-query-expansion + parallel-search + synth pipeline I was reaching for. mem-thought doesn't need to re-implement any of that.

What mem-thought needs is **just three things on top**:

1. **A synthetic query built from the conversation context** — `recallAgent(query)` takes a string. We need to construct a useful query from the running conversation. Options:
   - LLM call: "Given these last 4–6 turns, what query would surface relevant prior context?" — this is the user's "let the LLM hypothesize" insight
   - Deterministic anchor extraction (per /pro): top-N anchors joined into a phrase
   - Hybrid: deterministic anchors as base + 1 LLM call refines if anchors are too generic
2. **Outcome-aware re-ranking** of `recallAgent`'s returned results before emit (apply bead status weights — RESOLVED/SUPERSEDED/REJECTED/EXPLORATORY)
3. **Cadence + topic-drift discipline** — the wrapper concerns: 25 turns OR 15 min, idle ≥10 s, hard 3-cycles cap, drop emit if user sent ≥2 new prompts since cycle start

### Refactored mem-thought (with reality check)

```
[ Cadence trigger ]                   no LLM
   • 25 turns OR 15 min, idle ≥10s, hard 3 cycles/session
   │
   ▼
[ Build synthetic query ]             1 cheap LLM call (~1–2s, ~$0.001)
   • Input: last 4–6 raw turns
   • Prompt: "Given this conversation, what 1–3 word search query
              would surface relevant prior context from past sessions?"
   • Constraint via JSON schema: query must contain ≥1 token from
              the conversation text (drop if hallucinated)
   • Falls back to deterministic top-anchor extraction if LLM fails
   │
   ▼ query string
[ recallAgent(query, { since: '30d', maxRounds: 1 }) ]
   • Just call the existing library function
   • maxRounds: 1 to keep latency reasonable for background work
   • Internally does plan + fanout + speculative synth — already paid for
   │
   ▼ AgentRecallResult { results, summary, ... }
[ Outcome-aware re-rank ]             ~10ms, no LLM
   • Apply bead status weights from session-index.db metadata
   • Filter: skip emit if utility < threshold OR all hits are REJECTED
   │
   ▼
[ Topic-drift gate at emit time ]
   • Drop if user sent ≥2 new prompts since cycle started
   • Drop on /clear or workspace change
   │
   ▼
[ Templated emit ]
   • One AmbientEvent, source: recall, kind: thought
   • Header: [mem-thought, cycle N — query: "<query>", emitted Zs]
   • Body: recallAgent's synthesized text + bead/session pointers
   • Sidecar JSON: { query, beadIds, statuses, cost, durationMs }
```

**Cost per cycle**: ~$0.001 (query builder) + ~$0.01 (recallAgent does its own synth) ≈ ~$0.011/cycle
**Per-session**: 3 cycles × $0.011 = ~$0.033 max
**Heavy use** (4–6h/day, 2–3 sessions/day): ~$2–3/dev/month

This is **simpler than my agent-loop framing** (one wrapper LLM call instead of an iterative tool-call loop) AND **preserves the LLM-driven intelligence** (recallAgent's planner + the synthetic query builder both involve LLM judgment). The existing speculative-synth + multi-round planner pattern is doing the smart work — we just feed it the right query from conversation context.

### Implementation sketch (~100 LOC)

```typescript
// apps/silvercode/src/ambient-adapters/percolate.ts
import { recallAgent } from "@bearly/recall"

export function registerPercolateAdapter(opts: PercolateOpts): () => void {
  const cadence = createCadenceTrigger(opts)  // 25 turns OR 15min, idle gate
  let cyclesThisSession = 0

  cadence.onFire(async (turns) => {
    if (cyclesThisSession >= 3) return
    if (alreadyInFlight) return
    cyclesThisSession++

    const cycleStartTurn = currentTurn()
    const query = await buildSyntheticQuery(turns)  // 1 cheap LLM call
    if (!query) return  // skipped — no salient query

    const result = await recallAgent(query, {
      since: '30d',
      maxRounds: 1,           // keep latency bounded
      limit: 5,
      projectFilter: opts.repoScope,
    })

    if (turnsSinceStart(cycleStartTurn) >= 2) return  // topic drifted
    if (await /clear-pressed) return

    const ranked = applyOutcomeRanking(result.results)  // bead-status weights
    if (utility(ranked) < THRESHOLD) return  // silent on no-signal

    opts.queue.enqueue({
      source: "recall",
      kind: "thought",
      content: `[mem-thought, cycle ${cyclesThisSession}] ${result.summary}`,
      meta: { query, beadIds: ranked.map(r => r.beadId), ... },
    })
  })

  return () => cadence.dispose()
}
```

`recallAgent` is exported from `@bearly/recall` (the package exports it via `index.ts`). No CLI subprocess needed.

---

## User reframe (2026-04-27 23:25): empower the LLM like `/big` and `/complete`

After reading the /pro verdict below — which killed all three LLM calls in favor of deterministic anchor extraction — the user pushed back: **the value of mem-thought is letting an LLM hypothesize and iterate, not reducing it to keyword echo.** That's how `/big` and `/complete` work:

- **`/big`**: LLM reframes the problem, generates 10–20 hypotheses, runs 2 rounds of investigation, finds the design where the bug can't happen
- **`/complete`**: LLM generates investigations against acceptance criteria, iterates until done
- **`bun recall --agent`** (which already ships): LLM planner generates 10–29 query variants, parallel FTS fanout, coverage rerank, optional round 2, synthesizes

The pattern: **LLM as search agent**, with tools (FTS, read), iterating until coverage is good enough. NOT a pipeline that summarizes-then-plans-then-synthesizes serially.

### Reconciling with /pro

What /pro got right (keep):
- Don't summarize-then-plan-then-synth serially — that IS telephone-game compounding error
- Cadence tightening (rare, idle-gated, hard cap)
- Strict cross-session scope (Tier 2/3 lane separation)
- Bead-status outcome ranking (verifiable metadata)
- Topic-drift gate at emit time
- Don't synth as a tease that triggers Tier 1 follow-up

What /pro got wrong (reinstate):
- Killing the planner LLM loses the whole point — generating hypothesis queries from raw conversation IS the intelligence
- Killing iteration loses the ability to refine based on what's actually found
- "Replace with anchor regex" reduces mem-thought to keyword echo, which Kimi & Gemini themselves flagged as the wrong primitive for thematic matching

### The right shape: ONE agent loop, not three serial calls

```
[ Cadence trigger ]                      (same as /pro: 25 turns OR 15min, idle ≥10s, cap 3/session)
   │
   ▼
[ Single LLM agent loop ]                ~3–6 s, claude-haiku-4-5
   • Input: last 4–6 raw turns (NOT summarized — raw ground truth)
   • Available tools:
       search_recall(query)  → FTS5 results (cross-session, scoped)
       maybe: read_chunk(id) → full chunk if planner wants more detail
   • Loop: LLM calls search_recall N times based on what it finds
     (typically 3–5 queries; stops when coverage is good or 2 rounds done)
   • Same LLM emits the final digest at end of loop
   │
   ▼
[ Code-level filter ]                    ~10 ms, no LLM
   • Apply outcome-aware bead status weights
   • Skip emit if utility < threshold
   • Drop emit if topic drifted (≥2 new prompts since cycle start)
   │
   ▼
[ Templated emit ]
   • [mem-thought, cycle N] header
   • Digest paragraph composed by the agent loop
   • Sidecar JSON: { beadIds, statuses, queriesIssued, anchorsMatched }
```

### Why this is better than both prior designs

vs. **my original** (3 serial calls): no telephone game; one LLM sees raw turns + iterates with tool feedback. Same/cheaper cost.

vs. **/pro's verdict** (no LLM, regex only): preserves the LLM's hypothesis-generation intelligence; doesn't reduce thematic matching to keyword echo; matches the proven `/big` and `/complete` pattern.

vs. **`bun recall --agent`** (already ships): adds paced cadence, conversation-context awareness, outcome-aware ranking, Tier 2/3 lane separation, topic-drift gate. Essentially: "agent recall, but as a background process bound to a conversation."

### Cost & latency under agent-loop model

- Per cycle: 1 LLM session with 3–5 tool calls = ~3–6 s wall-clock, ~$0.005–0.015
- Per session: 3 cycles × ~$0.01 = ~$0.03
- Heavy use (4–6h/day, multiple sessions): ~$2–5/dev/month — still cheap, ~5x cheaper than my original 3-LLM-pipeline design but with full intelligence preserved

### Implementation sketch

`bun recall --agent` already implements the agent loop pattern. mem-thought becomes:

1. A paced wrapper around it that injects the conversation context as the planner input
2. Adds outcome-aware ranking on top of the agent's results
3. Applies the cadence/cap/topic-drift discipline
4. Emits as ambient event with `[mem-thought]` framing

So in code: `apps/silvercode/src/ambient-adapters/percolate.ts` calls the recall library's `recallAgent({ context, ... })` function (not the CLI subprocess), wrapping in cadence + filter + emit logic. ~150 lines new code, reuses everything existing.

---

## /pro review verdict (2026-04-27, $1.32 across GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro)

Captured at [`recall-pro-review-thought.md`](recall-pro-review-thought.md). All three models converged on the same critique. **Aggressive simplification, not refinement.**

### Unanimous redirects

1. **Kill the summarizer LLM** — feed last 4–6 turns raw to extraction. Summarization strips concrete identifiers (file paths, error strings, bead IDs) — exactly what we need most.
2. **Kill or collapse the planner LLM** — Gemini: collapse summarizer+planner into one structured extractor call returning JSON-validated queries with `source_term_from_conversation` field. Kimi/GPT: deterministic anchor extraction (regex for paths, errors, backticks, IDs, quoted phrases) — no LLM at all for query generation.
3. **Kill the synthesizer LLM** — biggest design flaw. All three:
   - Kimi: "synth + async = false memory with no provenance — disinformation vector"
   - Gemini: "synth = tease that triggers Tier 1 follow-up calls — turns async into sync"
   - GPT-5.4: "raw excerpts + structured sidecar JSON; never inject raw chunks AS instructions, but DO show them"
   Replace with templated raw-chunk emit.
4. **Cadence wrong** — tighten to **every 20–30 turns OR 15 min, AND user-idle ≥10 s**. Memory surfaces during human cognitive lulls, not mid-keystroke. 5min/10-turn creates "alert fatigue" — agent learns to ignore the channel.
5. **FTS5 alone is wrong for "thematic"** — it's keyword echo, will miss "auth middleware" ↔ "login guard" / "deadlock" ↔ "race condition". Either add vector embeddings OR honest framing change ("background grep, not mind wanderer").
6. **Strict scope partitioning** between Tier 2 and Tier 3 — Kimi: Tier 3 should ONLY query other sessions, preferably >24h old. Clean cognitive lanes; dedupe becomes safety net not primary defense.
7. **Hard per-session cap (3 cycles)** instead of complex cost-cap math — if it's not valuable in 3 shots, the trigger is broken.
8. **Framing alone is insufficient against attentional capture** — even labeled `[mem-thought]`, the LLM has no "ignore" executive function. Mitigation: rarity (low cadence) + context-position discipline (wrap in `<system_background_observation>` tags above user prompt, or sort to a non-answer-block channel).
9. **Outcome status needs a verifiable source** — `RESOLVED/REJECTED/SUPERSEDED` is fine for beads (real metadata) but hand-wavy for raw session content. Stick to bead-derived status; don't fabricate session-level taxonomy.
10. **No feedback loop** — system emits forever without learning. Add a "follow-up pull" heuristic: if agent calls `tribe.ask` on a referenced bead within N turns of the emit, count it as a win for telemetry tuning. If never referenced, down-rank.

### Refactored v1 (per /pro consensus)

```
[ Cadence trigger ]
   • Every 25 user turns OR 15 minutes
   • AND user-idle ≥ 10 s
   • AND skip if Tier 2 injected overlap in last 2 turns
   • Hard cap: 3 cycles per session
   │
   ▼
[ Anchor extraction ]                 ~50 ms, no LLM
   • Last 4–6 raw turns (no summary)
   • Deterministic regex: file paths, function/class names, error
     strings, backticked tokens, kebab-case ≥6 chars, quoted phrases,
     bead IDs (km-X.Y), issue keys (ABC-1234), SHAs, UUIDs
   • TF-IDF score by session-local DF
   • Take top 8–12 anchors
   │
   ▼
[ Lexical query construction ]        ~10 ms, no LLM
   • Combinations of high-salience anchors:
     - Single anchor of strong type (bead ID, error, function)
     - 2-gram pair of different-type anchors (error + file)
   • Type weights: bead-id 3.0, error 2.5, file 2.0, fn 2.0,
     pkg 1.5, generic 0.5
   • Require ≥1 high-weight anchor (≥2.5) OR 2 anchors summing ≥3.0
   • Max 6 hypotheses
   │
   ▼ hypothesis queries
[ Retrieval (FTS5 + optional vector) ] ~600 ms FTS / +500 ms vector
   • CROSS-SESSION ONLY — exclude current session
   • Optional v2: prefer sessions >24h old (clean lane vs Tier 2)
   • If embedding budget allows: vector search on aggregated
     anchor-text against session corpus (this is what "thematic"
     actually means)
   • If FTS5-only: be honest — this is keyword echo, not thematic
   │
   ▼ ranked hits
[ Outcome + coverage filter ]
   • Bead status weights (only when bead metadata present):
       RESOLVED +1.0, EXPLORATORY +0.5, SUPERSEDED +0.3, REJECTED -1.5
   • Recency: exp(-ageDays/30) × 0.3
   • Anchor diversity: docs matching ≥2 different anchor TYPES dominate
   • Skip emit if utility < 1.5 OR no high-weight anchor matched
   │
   ▼ filtered hits (or nothing — silent)
[ Topic-drift gate ]                  ~5 ms
   • Drop emit if user sent ≥2 new prompts since cycle started
   • Drop emit if /clear or workspace-change happened during cycle
   │
   ▼
[ Templated raw-chunk emit — NO synthesis LLM ]
   • One AmbientEvent, source: recall, kind: thought
   • Format:
       [mem-thought] Background scan — anchor matched: "<term>"
       Bead/Session: <id>  Status: <RESOLVED|EXPLORATORY|...>  <date>
       > <verbatim chunk excerpt, max 5 lines>
       Pointer: <full-id-for-tribe.ask>
   • Sidecar JSON payload (not displayed): { beadIds, statuses,
     anchorsMatched, utilityScores } — agent can pull more via Tier 1
```

**Cost per cycle**: ~$0 (no LLM calls) to ~$0.005 (single optional embedding call for vector retrieval).
**Latency per cycle**: ~1–2 s (vs original 5–8 s).
**Per-session cost**: ~$0.015 max (3 cycles × $0.005).
**Heavy-use cost**: <$1/dev/month. ~10x cheaper than my original.

### What this preserves from the original

- Cadence + idle/debounce gates (refined)
- Outcome-aware ranking via bead status (only)
- Cross-session scope (now strict)
- Per-session dedupe + Tier 2 coordination (via shared injection set)
- Async emit with `[mem-thought]` header (framing + rarity together do the safety work)
- Cancellation on session end + /clear

### What was killed

- Summarizer LLM (information-destroying)
- Planner LLM (under-constrained, replaced by deterministic anchor extraction)
- Synthesizer LLM (the "tease" / "false memory" / "disinformation vector" — replaced by templated raw chunk)
- "≥1 lexical token" grounding (under-constrained — replaced by high-weight anchor requirement)
- Daily cost-cap complexity (replaced by hard 3-cycles-per-session cap)
- Topic-shift detection as v1 (deferred — `/clear` + idle gate are enough)

### Open questions resolved

| Q | Original answer | /pro verdict | Final |
|---|----------------|--------------|-------|
| 1. Cadence | 10 turns OR 5 min | Tighter, idle-gated | 25 turns OR 15 min, idle ≥10 s |
| 2. Summarizer scope | last 12 turns LLM | Kill summarizer | Last 4–6 raw turns to anchor extractor |
| 3. Planner grounding | ≥1 lexical token | Under-constrained — kill or collapse | Deterministic anchor extraction; high-weight requirement |
| 4. Synth vs raw | Kept synth | Kill synth | Templated raw-chunk emit + sidecar JSON |
| 5. Dedupe scope | Per-session | Per-session + 24h cool-down per project (opt-in) | Per-session for v1; cool-down deferred |
| 6. Cancellation | Session end + /clear | Add topic-drift gate AT EMIT TIME | Session end + /clear + ≥2-new-prompts-since-start gate |
| 7. Tier 2+3 interaction | Shared dedupe | Strict scope partitioning > dedupe | Tier 3 cross-session-only; shared dedupe as safety net |
| 8. Framing solves causality | "Yes, framing carries the load" | Over-confident — rarity is the real fix | Low cadence + framing TOGETHER; tag wrapping; out-of-answer-block channel |

### One open issue not in original questions

**Embeddings vs FTS5** — Kimi + Gemini both flagged: pure FTS5 is keyword echo, not thematic matching. To genuinely fulfill the "oh wait, that reminds me of..." promise, we need vector search. Two paths:

- **(a) Lower the claim**: ship as "background grep" with FTS5; rename `mem thought` → `mem trace` or similar. Honest but smaller value.
- **(b) Add embeddings**: one OpenAI / Anthropic / local embedding call per cycle (~$0.001), vector search against session corpus. Requires building/maintaining a vector index alongside FTS5.

**Recommendation**: ship FTS5-only v1, label it clearly as "keyword-anchor recall" (not thematic), measure follow-up-pull rate. If ≥30% of emits get pulled, FTS is enough; if <10%, build the vector path. Defer the build until evidence justifies.

## Open questions for /pro review (resolved above — kept for traceability)

1. **Cadence trigger** — is "every 10 turns OR every 5 min" the right shape? Should it be content-aware (e.g., fire after a major topic shift)? Or even simpler — every turn-end with strong rate-limit?
2. **Summarizer scope** — last 12 turns, vs last 6 turns + cumulative summary, vs the whole conversation? What gives the planner the right input?
3. **Planner grounding constraint** — is "≥1 lexical token from summary" tight enough to prevent hallucination, or does it under-constrain? (E.g., the LLM might pick the most generic word from the summary and still drift.)
4. **Synthesis vs raw chunks** — Tier 2 design dropped synth in favor of raw chunks (per /pro previous review). Tier 3 keeps synth because the cycle is async and the digest IS the deliverable. Is that right, or should percolation also emit raw-chunks-with-labels?
5. **Dedupe scope** — per-session injection set is the obvious choice. Should it persist across session-start (so a new session starting on the same project doesn't re-surface what last session already saw)? Privacy/relevance tradeoff.
6. **Cancellation** — is "cancel in-flight on session end" enough, or do we need finer-grained interruption (e.g., user types `/clear` or major topic shift)?
7. **Tier 3 + Tier 2 interaction** — when both are running, is dedupe coordination enough or do they need a shared budget/policy?
8. **Failure mode I'm missing**: am I over-confident on framing solving causality? Is there a real-world adversarial case where the agent treats `[mem-thought]` as imperative anyway?

## Bottom line

Tier 3 (mem-thought) is the unique slice — every prior-art system has Tier 1 or Tier 2 or Tier 4 but skips this. Implementation is one new module (`percolate.ts`) + cadence loop in the controller, ~$10–15/dev/month at heavy use, zero user-facing latency. The biological framing ("oh wait, that reminds me of...") is the right mental model; the technical realization is paced background pattern-matching with grounded planner queries and outcome-aware ranking.

Ready for /pro review against the open questions before implementation.

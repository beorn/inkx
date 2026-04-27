# Recall trigger — design (post /pro review + user reframe)

Bead: [`km-silvercode.recall-trigger-upgrade`](../../.beads/issues.jsonl).

Synthesizes [the prior-art research](recall-triggers-research.md) + dual /pro reviews ([first](recall-trigger-pro-review-1.md), [second](recall-trigger-pro-review-2.md)) + user reframe (2026-04-27 22:55) into a shippable design.

## The three-tier model (user's reframe)

Recall isn't one thing. It's three complementary signals, each with a different latency budget, trigger source, and scope. They compose; we ship all three.

| Tier | Trigger          | Latency budget | Scope                    | Cost          |
|------|------------------|----------------|--------------------------|---------------|
| 1. On-demand (tool) | Agent-initiated | ~500 ms FTS  | Specific question        | $0 (only fires when agent calls) |
| 2. JIT injection    | System-initiated, salience-gated | <1 s sync | Current turn / latest prompt | $0 (no LLM in path) |
| 3. Percolation      | System-initiated, time/turn-paced | minutes async | Running conversation, multi-session memory | ~$0.05 per cycle, ~5 cycles/session |

**Why all three** — they're orthogonal in what they catch:

- **Tier 1** catches what the agent *knows it doesn't know* ("do we have prior context on X?"). Reactive, precise.
- **Tier 2** catches what the agent *should know but isn't asking about* — explicit identifier in turn, prior context exists. Fast, structural.
- **Tier 3** catches what the agent *doesn't know it doesn't know* — subtle thematic connections across sessions, slow-thinking pattern matching. The "oh wait, that reminds me of..." signal.

**Re-litigating Kimi's "async breaks causality"** — Kimi's argument applies to *async-pretending-to-be-JIT*: a digest fired at trigger time arriving 6 s later, after the agent has already answered. That IS gaslighting. But Tier 3 percolation is **labeled as background**: `[PERCOLATION cycle 3 — looking back over the last 12 turns, here's what came up]`. The agent treats it like memory surfacing later in a conversation, not as a freshly-relevant observation. Framing carries the load.

---

## Tier 1 — On-demand recall tool (agent-initiated)

The Letta / MemGPT pattern: the agent itself decides when memory matters and pulls it via a tool call. We expose `recall_search` as an MCP tool the spawned agent (Claude/Codex/Gemini) discovers automatically through the ACP/MCP boundary.

### Surface

```typescript
// MCP tool definition
{
  name: "recall_search",
  description: "Search prior session history and bead notes for context relevant to the current task. Use when you mention an identifier (file path, bead ID, error string, prior decision) and want to know if there's existing work on it. Returns 0–10 chunks with status metadata (RESOLVED / SUPERSEDED / REJECTED / EXPLORATORY).",
  parameters: {
    query: { type: "string", required: true, description: "what you want context on" },
    scope: { type: "string", optional: true, description: "repo / project / session-id (default: current repo)" },
    limit: { type: "number", optional: true, default: 5 }
  }
}
```

### Pipeline

```
agent calls recall_search(query)
   │
   ▼
[ FTS5 query against session-index.db ]   ~300–600 ms
   • Filter by scope (default: current repo)
   • Top-K hits with chunk text + bead metadata
   │
   ▼
[ Outcome-aware ranking ]                 ~50 ms
   • Same status weights as Tier 2: RESOLVED +1.0, REJECTED -1.0, ...
   • Sort by weight × FTS score, take top-K
   │
   ▼ structured response to agent
[
  { status: "RESOLVED", date: "2026-03-15", bead: "feedback-trace-v3",
    snippet: "Use flex-wrap, not white-space..." },
  { status: "REJECTED", date: "2026-03-10", bead: "wrap-pre-wrap-attempt",
    snippet: "white-space: pre-wrap caused overflow in Safari..." },
  ...
]
```

### Implementation

- New MCP server file: `apps/silvercode/src/mcp/recall-mcp.ts`
- Thin wrapper around the existing `vendor/bearly/tools/recall.ts` library function (NOT the CLI subprocess — direct library import)
- Registered in the coordinator-mcp server alongside the tribe tools, OR as a standalone tool the spawned ACP agent picks up

### Cost & latency

- $0 base — only fires when the agent calls
- ~500 ms per call (FTS5 + ranking + serialization)
- Naturally rate-limited by the agent's own decision-making

### Failure modes & mitigations

- **Agent doesn't discover the tool** — mitigation: clear tool description, mention in system-prompt fragment ("you have a recall_search tool — call it when you mention an identifier you'd want context on")
- **Agent over-calls** — mitigation: per-session cap (default 50 calls/session); above the cap, return the chunks with a hint "you've called recall a lot this session, consider summarizing what you've learned"
- **Agent under-calls** — that's where Tiers 2 + 3 fill in

---

## Tier 2 — JIT injection (system-initiated, salience-gated)

The fast, sync, structural-trigger path. Fires when the user prompt or assistant completion contains a *salient identifier* — file path, error string, kebab-case bead ID, etc. — and prior context exists for it.

### Pipeline

```
turn-end (user prompt or assistant completion)
   │
   ▼
[ Vocabulary gate ]                           ~50 ms, no LLM
   • IDF-weighted bead/session corpus token set (Bloom-filterable)
   • Structural regex fallback: file paths, error signatures,
     issue keys, SHAs, UUIDs, backticked tokens, identifiers ≥ 6 chars
   • Stoplist filter (yes/ok/continue/please/the/that/this/main/index/...)
   │
   ▼ candidate(s)
[ Per-(token, category, scope) dedupe ]
   • TTL by category: error 2–3 min, path 10 min, ID 10–30 min
   • 0-hit escape: retry after 60–90 s if last probe found nothing
   │
   ▼ admitted candidate(s)
[ Cap: 2 per turn default, 3 for long turns ]
   • turn_chars / 600 + 1, capped at 3
   • errors preempt other categories
   │
   ▼ ranked queries
[ FTS5 fanout ]                               ~300–600 ms
   • Run candidate query verbatim + 1 expansion (frequent bigram mining)
   • Filter: scope (current repo), echo (this turn's text)
   • Top-K hits per query
   │
   ▼ raw hits
[ Outcome-aware ranking ]
   • RESOLVED:    +1.0
   • SUPERSEDED:  +0.3 (label with pointer to canonical)
   • EXPLORATORY: +0.5
   • REJECTED:    -1.0 (label as DON'T DO)
   • Recency: gentle decay only
   │
   ▼ ranked + labeled chunks
[ Single digest emit ]
   • One AmbientEvent, source: recall, kind: jit
   • Body = top 2 hits with status header per chunk:
       [RESOLVED 2026-03-15] feedback-trace-v3
       <raw FTS snippet, 2-3 lines>
   • NO synthesis paragraph — agent does that on its own context
```

### Cost & latency

- ~50 ms vocab gate + ~600 ms FTS + ~100 ms ranking ≈ **~1 second sync**
- **$0 LLM cost** in v1
- Well under the "observation, not instruction" causality window

### Failure modes & mitigations

- **NL anaphora misses** ("that wrap thing we tried last week") — vocab gate may not catch if user wording doesn't overlap bead corpus. **Mitigation: Tier 3 percolation catches this.**
- **Common-name false positives** (`index.ts`, generic `Error:`) — mitigation: stoplist + min-content-length filters
- **Stale dedupe** (token genuinely re-relevant) — mitigation: 0-hit retry escape after 90 s

---

## Tier 3 — Percolation (system-initiated, slow-thinking, async)

The "while you're working, I'm thinking about what came up earlier" signal. Runs in the background on a paced cadence, scans the running conversation summary against multi-session corpus, surfaces thematic connections async.

### Pipeline

```
[ Cadence trigger ]
   • Every N turns (default 10) OR every M minutes (default 5)
   • Whichever comes first; reset both counters on emit
   • Skip if already in-flight (one percolation per session at a time)
   │
   ▼
[ Conversation summarizer ]                   ~1–2 s
   • Take last K turns (default 12) or full conversation if shorter
   • Cheap LLM (claude-haiku-4-5) compresses to: 3–5 bullet points
     of "what's the conversation actually about"
   • Output is the input to the planner
   │
   ▼ summary
[ Hypothesis planner ]                        ~2–3 s
   • Cheap LLM generates 3–5 "what might be relevant from prior
     sessions?" queries grounded in conversation tokens
   • Constraint: queries MUST share lexical tokens with the summary
     (no hallucinated topic drift)
   │
   ▼ 3–5 hypothesis queries
[ FTS5 parallel fanout ]                      ~600 ms
   • Same FTS index as Tiers 1 + 2
   • Coverage rerank: docs hit by ≥2 hypotheses dominate
   │
   ▼ ranked hits
[ Outcome-aware filter ]
   • Same status weights as Tier 2
   • Filter: hits older than 30 days get gentle recency decay
   • Filter: skip emit if total weighted score < threshold (no noise)
   │
   ▼ filtered hits (or nothing — silent on no-signal)
[ Synthesis ]                                 ~2–3 s
   • Cheap LLM produces ONE digest paragraph:
     "While working on X, I noticed sessions abc/def discussed
      similar Y. Worth knowing: <2-3 sentence summary>."
   • Always includes session/bead pointers (the agent can pull the
     full chunk via Tier 1 if relevant)
   │
   ▼
[ Async emit ]
   • One AmbientEvent, source: recall, kind: percolation
   • Header: [PERCOLATION cycle N — covering turns X–Y, emitted Z]
   • Body: the synthesis paragraph
   • Timestamp shows when the percolation STARTED (so the agent knows
     this is looking-backward context, not just-in-time)
```

### Why async is fine here (refuting Kimi's blanket "async breaks causality")

The agent doesn't treat percolation events as "freshly relevant to this turn." The header explicitly frames it: `[PERCOLATION cycle 3 — emitted 47s after turn 24]`. This is human-conversational behavior: "oh wait, that reminds me of something." The agent can incorporate-or-ignore based on whether the surfaced context happens to be useful for whatever it's doing now.

The "observation, not instruction" framing already neutralizes the imperative-pressure problem. Percolation just extends the framing across a longer time window.

### Cost & latency

- Per cycle: ~5–8 s wall-clock, runs in background (zero impact on user)
- Per cycle cost: ~$0.01–0.05 (haiku summarizer + haiku planner + FTS + haiku synth)
- Cadence ceiling: 5–10 cycles per session
- **Heavy-use cost: ~$0.50/session, ~$10–15/dev/month at 4–6 h/day**

### Failure modes & mitigations

- **Hallucinated queries** — planner constraint: queries must contain ≥1 lexical token from the conversation summary. Drop queries that fail this constraint before fanout.
- **Noise emission** — minimum-coverage threshold: skip emit if no hit covered by ≥2 hypotheses. Silent percolation cycles are fine.
- **Topic drift mid-cycle** — if the conversation moves to a totally different topic mid-percolation, the synthesis arrives stale. Mitigation: include a "topic at start of cycle" line in the header so the agent can judge relevance to current topic.
- **Cost runaway** — daily cap (default $1/dev/day). Above cap, fall back to no-LLM mode: hypothesis queries become structural (extract identifiers from summary, no planner LLM).

### Implementation

- New module: `apps/silvercode/src/ambient-adapters/percolate.ts`
- Scope-bound async loop in the controller's per-session subscribe
- Reuses the FTS5 + outcome-aware ranking from Tier 2 (shared module)
- Reuses the existing `bun recall --agent` planner pattern, but called as library not CLI

---

## Three findings that overrode my initial proposal

The /pro round (GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro) converged on three things I had wrong or under-weighted:

1. **Drop the synthesis step in the ambient path.** The spawned agent (Claude/Codex/Gemini) is a world-class synthesizer; passing it pre-synthesized paragraphs *restricts* its ability to look at the raw retrieved evidence. Inject **raw top-K chunks with metadata headers**, not a generated paragraph. Gemini was sharpest: "drop the 2-3s synth step, ship raw to the agent."

2. **Outcome-aware ranking is more important than the trigger choice.** All three models said this is the single highest-impact fix. Bead status — `RESOLVED` / `SUPERSEDED` / `REJECTED` / `EXPLORATORY` — must surface in the injection so the agent doesn't re-apply abandoned workarounds. **This guards against the failure mode that scared us into building this in the first place.**

3. **Async injection breaks causality (Kimi's framing).** If the recall digest arrives 6 s after the trigger, the agent has already emitted 400 tokens of off-the-cuff reasoning. The injection becomes either stale (topic moved on) or gaslighting ("the agent suddenly remembers"). **Either go sub-second sync, or expose recall as an MCP tool the agent calls *before* answering.** No async mitigation works.

These three together kill the original ~9 s pipeline-with-synthesis design I was leaning toward. The right shape is **fast, raw, outcome-labeled.**

## Final design (v1, ships in a day)

### Pipeline

```
turn-end (user prompt or assistant completion)
   │
   ▼
[ Vocabulary gate ]                           ~50 ms, no LLM
   • Match against bead/session corpus token set (IDF-weighted, Bloom-filterable)
   • Structural regex fallback: file paths, error signatures,
     issue keys, SHAs, UUIDs, backticked tokens, identifiers ≥6 chars
   • Stoplist filter (yes/ok/continue/please/the/that/this/...)
   │
   ▼ candidate(s)
[ Per-(token, category, scope) dedupe ]
   • TTL by category: error 2–3 min, path 10 min, ID 10–30 min
   • 0-hit escape: retry after 60–90 s if last probe found nothing
   │
   ▼ admitted candidate(s)
[ Cap: 2 per turn default, 3 for long turns ]
   • turn_chars / 600 + 1, capped at 3
   • errors preempt other categories
   │
   ▼ ranked queries
[ FTS5 fanout ]                               ~300–600 ms
   • Run candidate query verbatim + 1 expansion (frequent bigram mining)
   • Filter: scope (current repo/project), echo (this turn's text)
   • Top-K hits per query
   │
   ▼ raw hits
[ Outcome-aware ranking ]
   • Look up bead status from session-index.db metadata
   • RESOLVED:    +1.0 weight
   • SUPERSEDED:  +0.3 weight, label with pointer to canonical
   • EXPLORATORY: +0.5 weight
   • REJECTED:    -1.0 weight (or include only with explicit "DON'T DO" framing)
   • Recency: gentle decay only — old RESOLVED beats recent REJECTED
   │
   ▼ ranked + labeled chunks
[ Single digest emit ]
   • One AmbientEvent, source: recall
   • Body = top 2 hits with status header per chunk:
       [RESOLVED 2026-03-15]
       Bead: feedback-trace-v3
       <raw FTS snippet, 2-3 lines>
   • NO synthesis paragraph — agent does that on its own context
```

### Total latency budget: ~1 second sync

50 ms vocab gate + 600 ms FTS + ~100 ms ranking + emit. Well under the "observation, not instruction" causality window. No async dance.

### Total cost: $0

No LLM calls in the v1 path. Pure retrieval + metadata enrichment.

### Why this answers the design questions

| Concern                          | How v1 handles it                                                           |
|----------------------------------|-----------------------------------------------------------------------------|
| Verbatim-prompt query is weak    | Extract the *salient candidate*, query on that — not the full sentence      |
| Every-5-turns dumb cadence       | Vocab-gated trigger fires only when something recallable is present         |
| Amplifying past mistakes         | Outcome-aware ranking + status headers in the injection                      |
| Cost runaway                     | Zero LLM in v1; structural matching only                                    |
| Causality break from async       | <1 s sync pipeline; injection arrives BEFORE the agent answers              |
| User has to format prompts       | Vocab gate catches "wrap" via the bead corpus, not just kebab-case `wrap-x` |

### Trade-off explicitly accepted

**Pure NL anaphora ("that wrap thing we tried last week") will sometimes miss in v1** — vocab gate may not fire if the user's wording doesn't overlap with the bead corpus. The escape hatch is v2's MCP tool: the agent can call `recall_search` explicitly when it senses missing context. That decouples "sometimes-missing-NL-coverage" from "ambient pipeline complexity."

## v2 (1–2 weeks after v1 dogfooding)

Add three things in order of expected payoff:

1. **MCP tool `recall_search(query, scope)`** — Letta-style explicit recall that the agent calls when *it* decides. Composes with v1: agent gets ambient observations on structural triggers AND can pull explicitly when it senses ambiguity. ~$0 cost (only fires when agent invokes).

2. **LLM router as NL backstop** — only when the vocab gate finds nothing AND the turn matches a "query-like NL profile" (anaphora + interrogative). Cached system prompt → claude-haiku-4-5 at ~$0.0001 per check. Pays for itself if it lifts useful-recall rate by ≥20%.

3. **Frequent-bigram mining** — extract repeated unquoted bigrams from the turn ("wrap regression" mentioned 2x = candidate) before the LLM router fires. Captures the most common NL miss without LLM cost.

## v3 (deferred)

- Lightweight classifier (logistic regression / GBT) on logged features: "did the agent use this recall in the next 2 turns?" → trains the router.
- Cross-session personalization: per-user stoplists, boosted entities, learned canonical aliases.
- Mid-turn recall on very long assistant completions (currently turn-end only).
- Self-RAG / CRAG-style critic: secondary cheap-LLM pass that flags low-utility hits before they reach the agent.

## Implementation notes

### Files to modify

- `apps/silvercode/src/ambient-adapters/recall.ts` — replace turn-counter probe with vocab-gated extractor; drop synthesis call; emit raw hits with status metadata
- `apps/silvercode/src/controller.ts` — drop the every-5-turn counter wiring (the trigger now lives in the adapter, fed by every prompt+completion)
- `apps/silvercode/src/ambient-adapters/recall-extract.ts` — new pure module: `extractCandidates(text, vocab) → Candidate[]` and `dedupe(candidate, ttlMap) → boolean`
- `apps/silvercode/src/ambient-adapters/recall-vocab.ts` — new: build/cache the bead-corpus IDF set on session start
- `apps/silvercode/tests/ambient-adapters/recall.test.ts` — extend with extractor coverage tests

### Outcome metadata source

Bead status is already in `~/.claude/session-index.db` (the recall index pulls from beads via the bd dolt export). Synth layer reads it from the FTS5 hit's metadata column.

For non-bead session content, default to `EXPLORATORY` status with date as a recency signal.

### Stoplist seed

```
yes, ok, sure, continue, pls, please, thanks, ty, the, that, this, those, these,
main, index, src, tmp, foo, bar, baz, todo, fixme, xxx, build, dist, log
```

Plus per-project additions discovered during dogfooding.

### Telemetry events (loggily `silvercode:ambient`)

```
recall:extract  { textLen, candidateCount, categories[] }
recall:skip     { reason: "stoplist" | "deduped" | "no-match", token }
recall:probe    { token, category, ftsHits, durationMs }
recall:emit     { token, hitCount, statuses[] }
```

These feed the v3 ML classifier when it lands.

### What we're NOT doing

- No vector embeddings (FTS5 is sufficient for v1).
- No graph/entity store.
- No async/staged pipeline (rejected per Kimi's causality argument).
- No LLM in the ambient path for v1 (deferred to v2 router as backstop).
- No "synthesis" — the agent does that.

## Acceptance gates (when this lands)

- `npx tsc --noEmit` non-vendor: 0 errors
- `bun vitest run apps/silvercode/tests/ambient-adapters/recall`: all pass
- `bun tools/check-prompt-boundary.ts`: clean
- Smoke: dogfood for 1 hour with `DEBUG=silvercode:ambient`, observe at least 3 successful recall events with bead-status headers, verify zero `[REJECTED]` content surfaces without label
- Sub-second p95 latency from candidate-extracted to event-emitted

## Cost & latency summary

| Tier | Trigger latency | Retrieval latency | LLM cost / turn | Monthly @ heavy use |
|------|-----------------|-------------------|-----------------|---------------------|
| v1   | ~50 ms          | ~600 ms FTS       | $0              | $0                  |
| v2   | ~150 ms (LLM router on miss only)   | ~600 ms FTS  | ~$0.0001        | ~$2 / dev / month   |
| v3   | ~50 ms (classifier replaces router) | ~600 ms FTS  | ~$0.0001 retraining | <$1 / dev / month |

## Implementation roadmap (across all three tiers)

| Phase | Tiers shipped | New code | Dogfood signal | Cost |
|-------|---------------|----------|----------------|------|
| v1    | Tier 2 only   | vocab gate + extractor + ranking | per-turn JIT events with `[STATUS]` headers | $0 |
| v2    | + Tier 1      | MCP `recall_search` tool wrapper | agent calls when it senses missing context | $0 (only fires on call) |
| v3    | + Tier 3      | percolate.ts + summarizer + planner + synth | periodic `[PERCOLATION]` ambient digests | ~$10–15/dev/month |
| v4    | tuning        | learned classifier replaces vocab gate; cross-session personalization | better recall@K | ~$1/dev/month |

**Why this order:** Tier 2 first because it's the cheapest, fastest, and shipping-tomorrow-able. Tier 1 next because it's a thin wrapper around the recall library — opens up agent-driven recall without any new pipeline. Tier 3 last because it has the biggest cost surface and benefits from observing what Tiers 1 + 2 already deliver (so we know what gaps percolation needs to fill).

## Bottom line

Three orthogonal recall signals, each elegant on its own:

- **Tier 1 (on-demand tool)** — agent pulls when it knows it doesn't know.
- **Tier 2 (JIT injection)** — fast structural trigger when an identifier appears.
- **Tier 3 (percolation)** — slow background pattern-matching across the running conversation.

They compose because they cover orthogonal failure modes. Tier 1 fires when the agent is curious. Tier 2 fires when the user/agent says something concrete. Tier 3 fires when the conversation has been running long enough that there's something subtle worth surfacing.

Combined cost at heavy use: ~$15/dev/month. Combined latency tail on the user: ~1 second for Tier 2 (synchronous), zero for Tier 1 (only when agent invokes), zero for Tier 3 (background async).

**The user's three-use-case framing is the right architecture.** Each tier earns its place by catching what the other two miss.

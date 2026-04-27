# Recall trigger — design (post /pro review)

Bead: [`km-silvercode.recall-trigger-upgrade`](../../.beads/issues.jsonl).

Synthesizes [the prior-art research](recall-triggers-research.md) + dual /pro reviews ([first](recall-trigger-pro-review-1.md), [second](recall-trigger-pro-review-2.md)) into a shippable design.

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

## Bottom line

The user wanted "powerful but elegant/streamlined." This v1 is elegant: zero LLM cost, sub-second sync, outcome-aware ranking that solves the actual scary failure mode. The /pro round redirected me away from a baroque planner-with-synth pipeline (which would have been flashy but slow, expensive, and architecturally fragile). Ship v1, dogfood, only then add the LLM router and MCP tool.

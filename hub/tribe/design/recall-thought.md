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

## Open questions for /pro review

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

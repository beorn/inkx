# Recall trigger — design

Bead: [`km-silvercode.recall-trigger-upgrade`](../../.beads/issues.jsonl).

Synthesizes [prior-art research](recall-triggers-research.md) + dual /pro reviews ([first](recall-trigger-pro-review-1.md), [second](recall-trigger-pro-review-2.md)) + user reframes (2026-04-27) into a shippable design.

## The four-tier model — biological framing

Memory in agents maps to four cognitive modes humans use. Naming each tier after its biological analog (`mem lookup / mem inject / mem thought / mem dream`) makes the architecture self-documenting.

| Tier | Name        | State                                | Trigger                                 | Latency                         | Scope                               | Cost                              |
| ---- | ----------- | ------------------------------------ | --------------------------------------- | ------------------------------- | ----------------------------------- | --------------------------------- |
| 1    | mem lookup  | ✅ shipping as tribe.ask MCP tools    | Agent-initiated                         | ~500 ms FTS / ~6–9 s agent-mode | Specific question                   | $0 base; fires only on agent call |
| 2    | mem inject  | ⚠️ shipping as UserPromptSubmit hook | System, every prompt                    | ~400–500 ms sync                | Latest prompt                       | LLM synth in hook path            |
| 3    | mem thought | ❌ doesn't exist — this bead's scope  | System, time/turn-paced                 | minutes async                   | Running conversation, multi-session | ~$0.05/cycle, ~5/session          |
| 4    | mem dream   | ❌ doesn't exist — separate bead      | Offline, periodic (nightly / on-demand) | hours batch                     | Whole corpus                        | ~$1–5/run, ~30/month              |

### What each tier maps to cognitively

- **Tier 1 — mem lookup**: active recall. The agent *knows it doesn't know* and pulls. "What was that thing we tried for X?"
- **Tier 2 — mem inject**: priming. Something in the environment (the user's prompt) cues memory automatically.
- **Tier 3 — mem thought**: reflection / mind-wandering. The agent is working; in the background, prior context that *might* connect surfaces. "Oh wait, that reminds me of..."
- **Tier 4 — mem dream**: offline consolidation. While the agent isn't running, a batch process reorganizes the corpus — extracts atomic facts, deduplicates, resolves conflicts, promotes generalizations. The result feeds Tiers 1–3 with a cleaner store; doesn't emit events itself.

### Why all four are valuable (orthogonal coverage)

- Tier 1 catches what the agent *consciously needs*.
- Tier 2 catches what's *cued by current input*.
- Tier 3 catches what's *thematically related but not explicit*.
- Tier 4 makes Tiers 1–3 better by improving the underlying store.

## Tier 1 — mem lookup (already ships)

The bearly tribe MCP server (`vendor/bearly/plugins/tribe/`) exposes:

- `tribe.ask({ query })` — full agent-mode recall (planner + fanout + synth, ~6–9 s, ~$0.01/call)
- `tribe.brief()` — current-session paths/beads/tokens (~50 ms, $0)
- `tribe.plan({ query })` — planner variants only, no synth (~2 s, ~$0.001/call)

Spawned ACP agents discover these through the existing MCP registration.

**Optional polish (not blocking)**: improve the MCP tool descriptions so the spawned agent uses them more reliably. Mention them in a system-prompt fragment ("you have `tribe.ask` — call it when you mention an identifier you want background on"). One-file change; can ride along with Tier 3 v1.

## Tier 2 — mem inject (already ships, with documented issues)

`UserPromptSubmit` hook fires `hookRecall` on every non-trivial prompt and injects a synthesized `<recall-memory>` blob. This is what produces the recall snippets visible in our own session right now.

From session 51bc87a8 (11 d ago), the documented problems:

- **Redundant** — same docs re-appear across turns; Claude already has them in conversation context
- **Cache-hostile** — injected content varies per turn, invalidates the Anthropic prompt cache
- **Single-FTS only** — agent-mode (planner-fanout-rerank) was too slow for the hook latency budget
- **All-or-nothing** — no granularity to skip uninteresting turns

It works, but the cost-quality ratio is poor.

**What a Tier 2 v2 rebuild would need** (out of scope for this bead — track separately if/when we tackle it):

- Per-(token, scope) dedupe with TTL — never re-inject the same chunk in one session
- Skip-on-no-salience — most turns inject nothing; cache invalidation bounded to turns that warrant it
- No LLM in the hook path — raw chunks with status headers, sub-300 ms
- Outcome-aware ranking — `[RESOLVED]` / `[REJECTED]` labels (the same idea Tier 3 needs)

These are well-defined but touch the hook framework + dedupe state + cache mechanics. Bigger surface than this bead.

## Tier 3 — mem thought (the actual gap)

A slow-thinking process that scans the running conversation against the multi-session corpus and surfaces thematic connections async. The "oh wait, that reminds me of..." signal that humans do naturally. Neither Tier 1 (agent must ask) nor Tier 2 (only sees one prompt at a time) covers this.

### Pipeline

```
[ Cadence trigger ]
   • Every N turns (default 10) OR every M minutes (default 5)
   • Whichever comes first; reset both counters on emit
   • Skip if already in-flight (one percolation per session at a time)
   │
   ▼
[ Conversation summarizer ]                   ~1–2 s, claude-haiku-4-5
   • Take last K turns (default 12) or full conversation if shorter
   • Compresses to: 3–5 bullet points of "what's the conversation
     actually about + which entities/identifiers came up"
   │
   ▼ summary
[ Hypothesis planner ]                        ~2–3 s, claude-haiku-4-5
   • Generates 3–5 "what might be relevant from prior sessions?"
     queries grounded in summary tokens
   • Constraint: queries MUST share lexical tokens with the summary
     (no hallucinated topic drift)
   │
   ▼ 3–5 hypothesis queries
[ FTS5 parallel fanout ]                      ~600 ms
   • Same FTS index as Tier 1 / Tier 2
   • Coverage rerank: docs hit by ≥2 hypotheses dominate
   • Filter: skip docs already injected in this session (dedupe state)
   │
   ▼ ranked hits
[ Outcome-aware filter ]
   • Bead status weights: RESOLVED +1.0, EXPLORATORY +0.5,
     SUPERSEDED +0.3, REJECTED -1.0 (or label as "DON'T DO")
   • Recency: gentle decay only — old RESOLVED beats recent REJECTED
   • Skip emit if total weighted score < threshold (no noise)
   │
   ▼ filtered hits (or nothing — silent on no-signal)
[ Synthesis ]                                 ~2–3 s, claude-haiku-4-5
   • One digest paragraph: "While working on X, I noticed sessions
     abc/def discussed similar Y. Worth knowing: <2-3 sentence summary>."
   • Always includes session/bead pointers (agent can pull full chunk
     via Tier 1 if relevant)
   │
   ▼
[ Async emit ]
   • One AmbientEvent, source: recall, kind: percolation
   • Header: [PERCOLATION cycle N — covering turns X–Y, emitted Z]
   • Body: synthesis paragraph
   • Timestamp shows when the cycle STARTED (so the agent knows
     this is looking-backward context, not just-in-time)
```

### Why async is fine here (refuting Kimi's blanket "async breaks causality")

Kimi's argument applies to *async-pretending-to-be-JIT*: a digest fired at trigger time arriving 6 s later, after the agent has already answered. That IS gaslighting.

But Tier 3 is **labeled as background**: `[PERCOLATION cycle 3 — emitted 47 s after turn 24]`. The agent treats it like memory surfacing later in a conversation, not as a freshly-relevant observation. Framing carries the load. The "observation, not instruction" boundary already neutralizes imperative pressure; percolation just extends it across a longer time window.

### Cost & latency

- Per cycle: ~5–8 s wall-clock, runs in background (zero impact on user)
- Per cycle cost: ~$0.01–0.05 (haiku summarizer + haiku planner + FTS + haiku synth)
- Cadence ceiling: 5–10 cycles per session
- **Heavy-use cost: ~$0.50/session, ~$10–15/dev/month at 4–6 h/day**
- Daily cap (default $1/dev/day) — above cap, fall back to no-LLM mode (structural-only hypothesis extraction from summary, no planner LLM)

### Failure modes & mitigations

- **Hallucinated queries** — planner constraint: queries must contain ≥1 lexical token from the conversation summary. Drop queries that fail this constraint before fanout.
- **Noise emission** — minimum-coverage threshold: skip emit if no hit covered by ≥2 hypotheses. Silent percolation cycles are fine.
- **Topic drift mid-cycle** — if the conversation moves to a totally different topic mid-percolation, the synthesis arrives stale. Mitigation: header includes "topic at cycle start" so the agent can judge relevance to current topic.
- **Cost runaway** — daily cap (default $1/dev/day) with structural fallback above cap.
- **Re-surfacing rejected work** — outcome-aware ranking + status headers in the synthesis (`Note: prior session rejected this approach`).
- **Re-surfacing same docs** — per-session injection set; skip docs already emitted in any prior percolation cycle this session.

### Implementation

- New module: `apps/silvercode/src/ambient-adapters/percolate.ts`
- Scope-bound async loop in the controller's per-session subscribe (cadence trigger + cancellation on session end)
- Reuses the FTS5 + outcome-aware ranking from Tier 2 (shared module)
- Reuses the existing `bun recall --agent` planner pattern, called as a library function (not the CLI subprocess)
- Telemetry: `silvercode:ambient` namespace events `percolate:cycle-start`, `percolate:cycle-emit`, `percolate:cycle-skip`, `percolate:cost`

## Tier 4 — mem dream (separate bead)

Offline batch consolidation. Runs while the agent isn't (nightly cron, on-demand CLI, or post-session). Reorganizes the corpus so Tiers 1–3 query against a cleaner store.

### What it does

```
[ Source pool ]
   • All sessions touched in the last N days (default 7)
   • All beads modified in the same window
   • The current FTS index + atomic-fact store
   │
   ▼
[ Atomic-fact extraction ]                ~30–60 min, batch
   • Mem0-style: LLM reads each session, extracts discrete
     atomic facts ("user prefers terse output", "tried X
     workaround for Y, was rejected because Z")
   • Each fact carries: source-session, source-bead, date,
     status (asserted / superseded / rejected), entity tags
   │
   ▼ candidate facts
[ Deduplication ]
   • Embedding-based clustering: facts within similarity > 0.85
     collapse to one canonical with all source references
   │
   ▼
[ Conflict resolution ]
   • Detect contradicting facts ("X works" vs "X doesn't work")
   • Tag with timestamps; if both are recent + neither superseded,
     flag for human review (surface in next session as
     "needs-resolution" mem-thought event)
   │
   ▼
[ Generalization ]
   • Cluster facts by entity / topic; if N≥3 facts share a pattern,
     emit a generalized insight ("across 5 sessions on the wrap
     bug, the working approach was always flex-wrap")
   │
   ▼
[ Status reconciliation ]
   • Update bead status based on session evidence:
     - bead marked OPEN but session ended with "shipped X" → propose CLOSED-RESOLVED
     - bead marked CLOSED-RESOLVED but later session said "we reopened" → flag
   │
   ▼ refined corpus
[ Write back ]
   • Atomic facts go to a separate fact store (alongside FTS index)
   • Tier 1 / 2 / 3 query both: facts AND raw chunks
   • Reconciliation suggestions surfaced in next session as
     a single "mem-dream report" ambient event
```

### Cost & cadence

- One run/night: ~30–60 min wall-clock, ~$1–5 (mostly haiku for extraction + sonnet for reconciliation)
- ~$30/month at daily cadence for an active codebase
- Triggered by: cron + on-demand CLI (`bun mem dream` or similar)
- Outputs: refined fact store + reconciliation report (≤1 ambient event next session)

### Why this is a separate bead

- **Different shape**: not trigger-based, not user-facing latency, not turn-scoped. It's a maintenance pipeline.
- **Different infra**: needs scheduling (cron), needs LLM budget management (could spike cost), needs a fact store schema.
- **Different stakes**: gets the "atomic facts" abstraction right; informs the design of Tiers 1–3 queries (do they query facts, raw chunks, or both?).

Track as `km-silvercode.mem-dream-consolidation` (parent epic `km-silvercode.ambient-context-excellence`). For now, the existing FTS index + raw chunks is the substrate Tiers 1–3 work against. mem-dream becomes interesting once we have weeks of dogfooding data showing what the corpus actually looks like.

## Implementation roadmap

Scope of this bead: **Tier 3 (mem thought) only** — the actual gap.

| Phase | What ships              | New code                                                                                            | Dogfood signal                                             | Cost              |
| ----- | ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| v1    | Tier 3 mem thought      | percolate.ts + summarizer + planner + synth + cadence loop                                          | periodic [mem thought, cycle N] digests in chat scrollback | ~$10–15/dev/month |
| v2    | tuning                  | hypothesis grounding constraint, minimum-coverage threshold, daily cost cap, per-session dedupe set | fewer noisy emits, tunable budget                          | same              |
| v3    | optional: Tier 1 polish | improved MCP tool descriptions + system-prompt mention                                              | spawned agent discovers tribe.ask more reliably            | $0                |

**Tier 1 (mem lookup)** needs zero work in v1 path. **Tier 2 (mem inject) v2** and **Tier 4 (mem dream)** are separate beads — bigger surfaces, different concerns.

## Three findings that shaped the design

The /pro round (GPT-5.4 Pro + Kimi K2.6 + Gemini 3 Pro across 2 calls, ~$3 total) gave three architectural redirects:

1. **Drop synthesis from any sync ambient path.** The spawned agent is a world-class synthesizer; raw chunks with metadata headers beat pre-synthesized paragraphs. (Tier 3 keeps synth because the cycle is async and the digest IS the deliverable; the agent doesn't need to re-interpret.)
2. **Outcome-aware ranking matters more than trigger choice.** Bead status (`RESOLVED` / `SUPERSEDED` / `REJECTED` / `EXPLORATORY`) labels in every emission prevents amplifying past mistakes. All three models converged on this.
3. **Async pretending to be JIT is gaslighting.** Tier 3 sidesteps this by labeling itself as background; Tier 2 v2 (if we ever rebuild it) must stay sync.

## Bottom line

Four cognitive modes for memory. Two already ship. Two are gaps.

- **Tier 1 — mem lookup** — ✅ shipping as `tribe.ask` MCP tool. Optional polish.
- **Tier 2 — mem inject** — ⚠️ shipping as `UserPromptSubmit` hook. Known issues. Out of scope.
- **Tier 3 — mem thought** — ❌ doesn't exist. **This is what this bead builds.**
- **Tier 4 — mem dream** — ❌ doesn't exist. Separate bead (`km-silvercode.mem-dream-consolidation`).

Tier 3 (this bead) is the mind-wandering pattern-matcher that catches what Tier 1 (must be asked) and Tier 2 (only one-prompt scope) both miss. One new module (`percolate.ts`) + cadence loop. ~$10–15/dev/month at heavy use, configurable. Zero user-facing latency (background async). Output framed clearly as looking-backward context.

Tier 4 (separate bead) is the offline consolidation pass that improves the substrate Tiers 1–3 query against — atomic-fact extraction, deduplication, conflict resolution, generalization, bead status reconciliation. Lands once we have dogfooding data showing what the corpus needs.


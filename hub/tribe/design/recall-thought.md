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

## Prior-art /deep verdict (2026-04-28 00:05): no exact match found, novel composition

Fired GPT-5.4 prior-art search (knowledge cutoff Oct 2024 — caveat noted; 2025-2026 sweep needed). Full output captured at [`recall-thought-prior-art-deep.md`](recall-thought-prior-art-deep.md).

**Headline finding**: *"No exact match found. Each piece exists somewhere, but not the composition."*

### Cross-system gap analysis (Oct-2024 knowledge)

| System | Has separate sub-agent? | Reactive to multi-source events? | Prompt-cached compiled knowledge? | Delta emit to foreground? | Rich tools (recall+LSP+git+vault)? | Proxy/gateway shape? |
|---|---|---|---|---|---|---|
| **Letta / MemGPT** | ❌ self-managed | ❌ tool-call only | ❌ tier files in DB | ❌ full retrieval | partial (recall + archival) | ❌ |
| **ChatGPT memory** | ❌ self-managed | ❌ capture-trigger only | ❌ summary in system prompt | ❌ inject-once at start | ❌ | ❌ |
| **Mem0** | ❌ orchestration layer | ❌ on-demand only | ❌ atomic facts in vector + graph DB | ❌ on-demand | partial (vector + graph) | ❌ |
| **Anthropic memory tool** (claude-agent-sdk) | ❌ self-managed | ❌ tool-driven | ❌ file-based notes | ❌ full inject | ❌ | ❌ |
| **Cursor 2.x** | ❌ inline RAG | ❌ per-prompt only | partial (embedding index) | ❌ inject-per-prompt | partial (codebase + files) | ❌ |
| **Sourcegraph Cody** | ❌ inline | ❌ per-prompt or user-action | partial (embeddings + symbols) | ❌ per-prompt | partial (symbols + repo) | ❌ |
| **Aider repo map** | ❌ static | ❌ static | ❌ static | ❌ always-on inject | partial (symbols only) | ❌ |
| **GitHub Copilot Workspace** | ❌ planner agent | ❌ session-bound | ❌ | ❌ foreground produces all | partial (repos + issues + PRs) | ❌ |
| **AutoGen / CrewAI** | ✅ separate roles | partial (within run) | ❌ per-role context | partial (interject) | depends | ❌ not IDE proxy |
| **Generative Agents** (Stanford 2023) | partial (multi-agent) | ✅ env events | partial (episodic memory + reflection) | ✅ pushes observations | ❌ | ❌ |
| **LangGraph Cloud** | ✅ stateful graphs | depends | ✅ checkpoints | depends | depends | ❌ not IDE proxy |
| **OpenRouter / LiteLLM / Portkey / Helicone** | ❌ stateless | ❌ | ❌ | ❌ | ❌ | ✅ but transform-only |
| **MCP servers / Continue** | ❌ client-side orchestration | depends | ❌ | ❌ | ✅ tools | ❌ |
| **mem-thought (this design)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (cloud option) |

The closest cluster is **Generative Agents (Stanford 2023)** — has reflection + memory consolidation + agents push observations. But not IDE-integrated, no rich tools, no proxy architecture. Conceptually validates the "mind-wandering" idea, doesn't preempt the composition.

**LangGraph Cloud** could *build* this composition — stateful agent graphs with persistence and checkpoints — but it's a framework, not an out-of-box product with this shape.

### What the composition implies for moat positioning

GPT-5.4's verdict: *"The composition appears novel as of late 2024. Each ingredient is known; the recipe isn't."*

Specific moat sources identified:

1. **Composition/IP** — exact split of responsibilities and pacing (delta emits vs. full snapshots; event filters; dedupe; outcome-aware ranking)
2. **Tool depth** — coherent integration of recall FTS + LSP + git/CI + vault hybrid search. Most systems pick 1–2; this picks all.
3. **Prompt-cached compiled-knowledge engineering** — cache breakpoint placement + cost discipline + state retention strategy. Non-trivial engineering.
4. **Visibility + operator UX** — many systems are opaque. The side-panel/tooltip/inspector/journal layers are uncommon.
5. **Cloud-as-proxy positioning** — agent-in-the-middle on the ACP wire is a fresh wedge ([acp-proxy.md §3.4](../../silvercode/future/ai-terminal/acp-proxy.md))

### gbrain (Garry Tan, garrytan/gbrain v0.9.1) — closest validation of the four-tier framework

gbrain (https://github.com/garrytan/gbrain) is a production "personal knowledge brain" that an AI agent reads/writes on every interaction. **It ships 3 of our 4 tiers** for a different corpus (personal life vs coding sessions). Most relevant prior-art find for the four-tier framework — more than Hermes, more than any /deep finding.

**gbrain mapped to the four tiers**:

| Tier | gbrain implementation | Status |
|---|---|---|
| **Tier 1 — mem lookup** | `gbrain search` (tsvector keyword) + `gbrain query` (hybrid: tsvector + RRF + pgvector + query expansion) | ✅ ships, hybrid not FTS-only |
| **Tier 2 — mem inject** | "Brain-first lookup on every message" — permanent agent discipline; reads brain before responding to anything | ✅ ships, more aggressive than UserPromptSubmit hook (it's a behavioral rule, not a system injection) |
| **Tier 3 — mem thought** | NOT PRESENT — no separate continuous sub-agent watching events. Entity detection runs in the foreground agent on each message, not a separate process. | ❌ the gap |
| **Tier 4 — mem dream** | Explicit "dream cycle" in `docs/guides/cron-schedule.md`: nightly cron with entity sweep + citation fixes + memory consolidation | ✅ ships, exactly the pattern |

**Striking overlaps with our design**:

- **"Compiled truth + timeline"** — gbrain pages have an above-the-line synthesis (current state) + below-the-line append-only evidence. Exactly the compiled-knowledge format mem-thought's sub-agent maintains. They nailed the convention we sketched.
- **Multi-source event ingestion** — voice, email, X, calendar, meetings flow into brain pages via integration recipes. Validates our "multi-source events" thesis for mem-thought (file changes, tribe broadcasts, CI, peer activity).
- **Hybrid search substrate** — PGLite + pgvector. We use SQLite + FTS5 for recall and qmd for hybrid; gbrain proves the value of vector search at this layer. Argues for adding embeddings to recall (per our v2/v3 roadmap).
- **Operational shape** — cron + integrations + recipes is the mature production pattern. Our `bun tribe install` hook setup is in the same family.
- **"Compounding thesis"** — every read-write cycle adds knowledge. Our journal file + cumulative compiled-knowledge has the same compounding property.

**Different corpora, same architecture**:

| Corpus | Substrate | Best fit |
|---|---|---|
| Personal life (people, meetings, decisions, ideas, calendar, email) | gbrain (PGLite + pgvector) | gbrain |
| Claude Code session history | bearly recall (SQLite + FTS5) | tribe.ask, mem-thought |
| Markdown vault knowledge | qmd (BM25 + vector + HyDE) | qmd, mem-thought v2 |

**The four-tier framework is corpus-agnostic.** gbrain proves it works for personal life. Our work demonstrates it for coding sessions + vault. A complete agent system runs the framework on every relevant corpus.

**Critical implication for mem-thought**:

- **Tier 3 is genuinely the gap** — gbrain has shipped 3 of 4 tiers and validated the framework. We are not reinventing wheels for Tier 1/2/4; those are well-trodden territory.
- **mem-thought as gbrain consumer** — the sub-agent could call `gbrain query` as one of its tools (in addition to recall_search, qmd_query, lsp_*, bd_*). Cross-corpus reactive surfacing.
- **Adopt gbrain's "compiled truth + timeline" format** — for the compiled-knowledge state in the sub-agent. Already battle-tested.
- **Adopt gbrain's "dream cycle" patterns for our Tier 4** (mem-dream) — entity sweep, citation fixes, consolidation. We don't need to design from scratch.

**For acp-proxy positioning**:

- gbrain is a **P3 corpus + skills package** the agent consumes. Not P1 (host) or P2 (proxy).
- silvercode + tribe could **host gbrain as one P3 sub-agent** alongside others (memory-over-sessions, critic, lint, ...).
- **The four-position thesis becomes**: silvercode is the multi-corpus, multi-sub-agent host; gbrain is one of the corpora; mem-thought is the reactive cross-corpus search agent.

**References**:
- https://github.com/garrytan/gbrain
- https://github.com/garrytan/gbrain/blob/master/docs/GBRAIN_SKILLPACK.md — full agent playbook (compounding thesis, brain-agent loop)
- https://github.com/garrytan/gbrain/blob/master/docs/guides/cron-schedule.md — dream cycle protocol
- https://github.com/garrytan/gbrain/blob/master/docs/guides/brain-vs-memory.md — three-layer model: brain (world knowledge), agent memory, session

### Hermes Agent (Nous Research, Feb 2026) — closest shipped product

Discovered via OpenRouter's coding-CLI leaderboard. Hermes Agent is the closest shipped product to mem-thought as of Apr 2026 — and it shipped AFTER GPT-5.4's Oct 2024 knowledge cutoff, exactly what the caveat warned about.

**Striking overlaps**:

- **SQLite + FTS5** session-history search — same substrate as bearly recall
- **Markdown memory files** (`memory.md`, `user.md`) loaded into context — same operator-readable durability we proposed for the journal file
- **"Every 10 turns, internal review"** — almost exactly mem-thought's 12-turn cadence
- **Skill self-improvement** — agents detect better approaches and rewrite skills mid-session
- **agentskills.io open standard** — skill-format ecosystem play; Hermes is making a market here

**Critical architectural difference**:

| Dimension                  | Hermes Agent                         | mem-thought                                    |
|----------------------------|--------------------------------------|-------------------------------------------------|
| Memory locus               | Self-managed (foreground reviews itself) | Separate sub-agent watches events             |
| Trigger                    | Internal review every 10 turns       | Reactive to multi-source events                 |
| Event sources              | Conversation only                    | Prompts + completions + tribe + files + CI      |
| Output                     | Updates own memory.md / creates skills | Delta emits to foreground via ambient channel  |
| Topology                   | Local CLI (foreground = memory holder) | Topology-portable (10 deployment shapes per acp-proxy.md §4.6) |
| Cognitive tier             | Tier 4 mem-dream (periodic consolidation) | Tier 3 mem-thought (reactive surfacing)      |

**They're complementary, not competing.** Hermes is Tier 4 flavored (periodic consolidation, skill extraction, self-improvement). mem-thought is Tier 3 (reactive surfacing of relevant prior context). A complete agent could run both — Hermes-style self-managed Tier 1 + Tier 4, plus mem-thought-style separate-sub-agent Tier 3.

**What this changes for the moat thesis**:

- The "no exact match found" verdict from /deep stands — Hermes isn't the same composition. It's adjacent.
- Hermes **validates the market** for persistent, learned, cumulative agent memory. We don't have to convince anyone the category is interesting; Nous Research has done that.
- Differentiation tightens around **multi-source reactivity + separate-sub-agent-as-watcher + proxy-deployable**. Hermes can't easily span topologies (it's a foreground CLI agent).
- **Skill-format compatibility (agentskills.io) is an ecosystem play we could join** rather than compete on. mem-thought could surface "skill X from prior session" via Tier 3 deltas; mem-dream (Tier 4) could write skills in the agentskills.io format.
- The remaining /deep follow-up sweep with actual Deep Research API on 2025–2026 data is even more important now — if Hermes shipped in Feb 2026 and we missed it, other things may have too.

**References**:
- https://github.com/nousresearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/
- https://hermesatlas.com/guide/ — Apr 2026 v0.10.0 guide

### Adjacent reference: Vercel's stack (chat-sdk.dev)

[chat-sdk.dev](https://chat-sdk.dev/) is Vercel's TypeScript framework for cross-platform chatbots (Slack / Teams / Discord / WhatsApp / GitHub). Event-driven, pluggable adapters, integrates with Vercel AI Gateway + AI SDK + Workflows.

**Layer mismatch with mem-thought**: chat-sdk is *chatbot transport* — deliver messages to Slack/Discord. mem-thought is *sub-agent state + reactive context*. Different layers; chat-sdk explicitly lacks memory / sub-agents / MCP / ACP per its docs.

What's worth carrying forward:

- **Pluggable-adapter pattern** — chat-sdk's "unified API across platforms" is the same architectural shape as our deployment-topology survey ([acp-proxy.md §4.6](../../silvercode/future/ai-terminal/acp-proxy.md)). Validates "topology-portable contract" as a winning shape.
- **Vercel as a credible competitor to watch** — they have the AI infrastructure stack (Gateway + SDK + chat-sdk + Workflows) and the distribution. If they extend AI Gateway from transforms to stateful sub-agents, they're the obvious incumbent for the category. They haven't yet — but it's the most-likely-next-shoe.
- **Doesn't change the prior-art verdict** — none of Vercel's products today host persistent stateful sub-agents.

### Critical caveat: knowledge cutoff Oct 2024

GPT-5.4's training data cuts off Oct 2024. The agent-memory space has moved fast in 2025–2026 — Anthropic released the memory tool, Letta has shipped updates, Mem0 has a roadmap. **Nothing in /deep's response covers 2025-2026 systems**, which is exactly the timeframe a parallel design might have shipped.

Recommended follow-up: actual web-sweep with 2025-2026 search filter on these terms:

- "background memory agent IDE delta emit" 2025
- "agent proxy persistent memory MCP ACP" 2025
- "multi-agent memory watcher codebase CI events" 2025
- "prompt caching compiled knowledge agent" 2025-2026
- "Sourcegraph Cody background memory 2025"
- "Copilot Workspace memory background 2025"
- "Letta MemGPT background watcher events 2025"

This needs the actual Deep Research API (multi-source web sweep, ~$2-5, 2-15 min) — what we ran was a single GPT-5.4 call. Still useful for the architecture-comparison framing; insufficient for 2025-2026 vendor announcements.

### Implications for shipping

If we ship mem-thought v1 and it's even directionally close to the design, **first-mover claim is plausible**. Worth:

- Writing a focused public design doc (not just internal hub/) once shipped
- Filing a defensive disclosure or even a provisional patent on the composition
- Branding the pattern ("agent-in-the-middle memory" or similar) so it gets known by name
- Talking about it openly — the composition has enough specificity that public discussion strengthens position rather than weakens it (engineers trying to build the same thing without the silvercode/tribe substrate will rebuild slower)

The cross-reference loop is now in place: [recall-thought.md](recall-thought.md) ↔ [acp-proxy.md §3.4](../../silvercode/future/ai-terminal/acp-proxy.md). Either one is a credible product narrative on its own; together they're a stronger moat thesis.

---

## Scope expansion (2026-04-27 23:58): private context maintainer, not just memory

Two user additions reframe the sub-agent from "memory of past sessions" to **"private comprehensive context maintainer for the foreground agent"**:

1. **LSP integration** — the sub-agent loads up the entire repo's structural context via LSP (Language Server Protocol). Symbols, type signatures, callsites, imports/exports, tests, recent diffs — everything the IDE knows.
2. **Big context budget** — prompt caching makes ~50K-token cached context affordable (~$0.001/event). The sub-agent can carry comprehensive state, not just a brief digest.

This changes what the sub-agent IS. It's no longer just "the memory layer." It's the **always-on private research assistant** that knows:
- What past sessions did (recall FTS index)
- What the repo looks like (LSP symbol map)
- What's in the vault (qmd hybrid index)
- What beads are open / closed / in-progress
- What peer sessions are doing (tribe broadcasts)
- What's changed in this session (file watches, CI events)

Foreground agent stays focused on the immediate task; sub-agent provides whatever broader context becomes relevant. Like having a research librarian alongside the main worker.

### Tools the sub-agent gets

```typescript
const TOOLS = [
  // Memory / history
  { name: "recall_search",   description: "Search Claude Code session history (FTS5)" },
  { name: "qmd_query",       description: "Search markdown knowledge bases (BM25 + vector + HyDE)" },
  { name: "read_chunk",      description: "Fetch full content of a session/bead chunk" },

  // Repo structural context (LSP)
  { name: "lsp_symbol",      description: "Get definition + type of a symbol (function/class/type)" },
  { name: "lsp_references",  description: "Find all references to a symbol" },
  { name: "lsp_workspace_symbols", description: "Search workspace symbols by name" },
  { name: "lsp_hover",       description: "Get hover info (docstring + type) for a position" },
  { name: "lsp_diagnostics", description: "Get current errors/warnings in workspace" },

  // Bead / issue context
  { name: "bd_show",         description: "Show a bead by ID with description + notes" },
  { name: "bd_search",       description: "Search beads by keyword" },

  // File context
  { name: "read_file",       description: "Read file contents (path-scoped to current repo)" },
  { name: "git_log",         description: "Get recent commits affecting a path" },
  { name: "git_diff",        description: "Show diff for a path or range" },

  // Emit
  { name: "emit_delta",      description: "Push a short ambient observation to the foreground agent" },
  { name: "emit_full",       description: "Push the complete compiled-knowledge snapshot" },
]
```

### Context budget with prompt caching

Anthropic prompt caching: cache writes cost 25% MORE than base tokens (one-time), but cache reads cost 10% of base tokens. Effective cost equation:

```
cost_per_event ≈ system_prompt_size × 0.1×base_rate    (cache hit)
                + new_event_tokens × 1.0×base_rate     (uncached append)
                + tool_results_tokens × 1.0×base_rate  (uncached)
                + response_tokens × 5×base_rate        (output is more expensive)
```

For claude-haiku-4-5 (input ~$1/MTok, output ~$5/MTok) with 50K of cached context + 500-token event + 1K tool results + 500-token response:

```
50,000 × 0.0001 = $0.005   cache hit
   500 × 0.001  = $0.0005  new event
 1,000 × 0.001  = $0.001   tool results
   500 × 0.005  = $0.0025  response
                  ─────────
                  ~$0.009 per event
```

That's tractable but adding up — 100 events/session × $0.009 = ~$0.90/session. Heavy use ~$50/dev/month. Higher than my earlier estimate.

**Cost optimizations**:
- Cache the LSP symbol map separately (only changes on workspace edits — 90% of events hit the cache cleanly)
- Don't include full LSP map in EVERY step — sub-agent fetches symbols on-demand via tools
- Event coalescing: batch rapid-fire events (e.g., file changes within 500ms) into one step
- Skip-events filter: don't step the sub-agent on noise (multiple similar file changes, debounced tribe broadcasts)
- Smaller models for routing: claude-haiku-4-5-mini (if it exists) for "is this event worth processing?" gate before main step

With these: ~$0.002–0.005 per processed event, ~$0.10–0.30/session, **~$5–15/dev/month** at heavy use. Same as my earlier estimate.

### Realistic context shape (50K budget)

```
─── CACHED (read at 10% rate) ────────────────────────────
System prompt + tool descriptions     :   3K
Repo overview (top-level structure)   :   2K
LSP workspace symbols (truncated)     :  10K  (top 200 symbols)
Recent git log (last 30 commits)      :   2K
Open beads list (titles + status)     :   3K
Compiled knowledge (running)          :   5K  (markdown digest)
Surfaced beads/sessions (dedup state) :   1K
Tool result history (last N events)   :  20K
─── UNCACHED (read at 100% rate) ─────────────────────────
Latest event                          : 0.5K
Sub-agent's response (with tool calls): 0.5–2K
─── TOTAL ─────────────────────────────────────────────────
Cached:    46K  → cost ~$0.0046 per cache hit
Uncached:   2K  → cost ~$0.012 (output dominates)
                  ─────────
                  ~$0.017 per "active" event (with tool calls)
                  ~$0.005 per "passive" event (state update only)
```

For a typical session (maybe 30 active + 70 passive events): ~$0.85/session worst case, more like ~$0.50 with skip-events filter.

### Why bigger context wins here

The sub-agent has stuff the foreground agent doesn't:
- It can hold the FULL repo symbol map without burning the foreground's prompt budget
- It can hold every prior session's recall hits considered, not just the chosen ones (so it can change its mind later)
- It can keep accumulating compiled-knowledge across the whole session without forgetting

The foreground agent gets only what's distilled to be relevant — through delta emits — and stays focused. The sub-agent does the broader thinking with its larger working memory.

This is exactly the cognitive split humans use: foreground attention is narrow and focused; background knowledge is broad and accessible-on-demand. The sub-agent IS the background knowledge.

### Caching implementation

Anthropic's `cache_control` markers on message blocks. The sub-agent's prompt structure becomes:

```typescript
const messages = [
  { role: "system", content: [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: TOOL_DESCRIPTIONS, cache_control: { type: "ephemeral" } },
  ]},
  { role: "user", content: [
    { type: "text", text: REPO_CONTEXT, cache_control: { type: "ephemeral" } },
    { type: "text", text: COMPILED_KNOWLEDGE, cache_control: { type: "ephemeral" } },
    { type: "text", text: NEW_EVENT },  // not cached — changes every step
  ]},
]
```

When repo changes (file edits, new commits), invalidate the REPO_CONTEXT cache. When compiled knowledge is updated, refresh that block. Carefully placed cache breakpoints keep most hits in steady state.

---

## Prior art audit + visibility design (2026-04-27 23:55)

### Has anyone built this exact shape?

Surveying production memory systems for the specific composition we're describing — **a separate long-running sub-agent watching session events, maintaining compiled-knowledge in its own prompt-cached context, emitting incremental deltas to the foreground**:

| System                    | Sub-agent (vs self-managed) | Reactive to all events | Compiled-knowledge state | Delta emit | Closest match |
|---------------------------|---------------|------------------------|-----------|-----|--------------|
| **Letta / MemGPT**        | self-managed                | only tool-driven       | tiers (core/recall/archival) in DB | no — full retrieval | tool-call pattern |
| **ChatGPT memory**        | self-managed                | only on capture trigger | running summary + facts | inject-at-start only | running summary idea |
| **Mem0**                  | orchestration layer         | on-demand only         | atomic facts in vector + graph DB | no — on-demand | atomic-fact extraction |
| **Anthropic memory tool** (claude-agent-sdk) | self-managed | only when tool-called | file-based notes | full inject | file-based notes |
| **Cursor codebase RAG**   | none (inline RAG)           | per prompt only        | embedding index | inject per prompt | implicit retrieval |
| **Aider repo map**        | none (static)               | static, rebuilt        | symbol map | full inject | static index |
| **CrewAI/AutoGen roles**  | yes (separate role)         | depends on orchestration | ad-hoc | depends | separate-role pattern |
| **MemoryGPT papers (2024–25)** | yes (in some)            | mostly offline batch   | knowledge graph | mostly batch consolidate | offline consolidation |

**No system combines all four traits the way this design does**: separate sub-agent + reactive to all session events + prompt-cached compiled-knowledge in its own context + incremental delta emit.

The novelty is the **composition**, not any individual piece:
- Separate sub-agent → CrewAI/AutoGen roles
- Tool-call memory → Letta/MemGPT
- Running structured digest → ChatGPT chat-history-summary
- Reactive to events → reactive systems / streaming aggregation
- Prompt caching for state retention → Anthropic's recent caching capability
- Multi-source events (prompts + tribe + files + CI) → ambient context safety design (Phase 6.b shipped)

This is worth flagging as a potential differentiation/moat for silvercode positioning. May warrant a `/deep` web-research pass to confirm no recent papers/products land on the same composition, but based on current knowledge this is genuinely novel territory.

### Visibility — making the sub-agent legible in silvercode

A memory sub-agent is opaque if you can't see what it's doing. Three visibility layers, increasing depth:

#### 1. Side-panel "Memory" pane (always-visible)

Sits alongside existing Sessions / Todos / Agents / Mode entries in `apps/silvercode/src/components/SidePanel.tsx`. Default collapsed; click to expand.

```
Memory · idle  · 14ids · 3hyps · 7emit · $0.04
  ▸ recallAgent (4 sessions discuss it)         [searched]
  ▸ mem-thought design                           [active]
  ▸ Letta tool-call pattern                      [searching]
  ▸ /pro reviews                                 [surfaced]
  ▸ compiled knowledge                           [pending]
```

Status flags:
- `idle` — between events
- `searching` — FTS call in flight
- `reasoning` — LLM step in flight
- `emitting` — about to push delta
- `budget-paused` — daily cap hit
- `disabled` — `SILVERCODE_MEM_DISABLED=1`

Click an identifier → inline expansion shows hits + which ones surfaced, which still pending.

#### 2. Live hover on emitted ambient rows

Each `[mem-thought, delta]` ambient row in the chat scrollback gets a hover popover (uses existing `usePopoverHandlers`):

```
[mem-thought, delta — emitted 14:55, cycle 3]
  Query: "compiled knowledge"
  Hits considered: 5 (3 surfaced before, 2 new)
  Reasoning: Conversation introduced "compiled knowledge" as new
            term; recall surfaced Letta-style memory tiers + this
            session's prior /pro reviews on memory state.
  Cost: $0.0009 (0.6s)
```

This makes every emit traceable — user can see why the agent thought this was worth surfacing.

#### 3. Inspector view (`/memory` slash command)

Full-screen inspector showing the sub-agent's complete state:

- **Compiled knowledge** rendered live (the markdown digest the sub-agent maintains)
- **Conversation log** — system prompt + every event + tool calls + responses (the sub-agent's full LLM context)
- **Identifier table** — all tracked, with weights, status, last-seen
- **Hypothesis list** — active queries with hits + coverage
- **Cost breakdown** — per-event cost, total session cost, daily-cap remaining
- **Tool-call trace** — every search + result + decision
- **Manual controls**:
  - `pause` / `resume` — stop accepting events temporarily
  - `clear` — reset compiled knowledge (next event re-builds)
  - `force-emit` — dump current compiled knowledge as full snapshot
  - `dump-snapshot` — write to file for offline analysis
  - `kill-budget` — turn off the agent for the rest of session

#### 4. Journal file (durable record)

Sub-agent appends to `~/.claude/<session-id>/memory.md` continuously:

```markdown
# Memory journal — session 4de4a3ab — started 2026-04-27 14:30

## 14:30:15 — event: user-prompt
> "let's design recall-thought (tier 3)"

Reasoned: User starting design work on Tier 3.
Searched: recall("recall-thought tier 3 design") → 2 hits.
Emitted: delta — past sessions discuss tier framework
Cost: $0.0011

## 14:32:08 — event: assistant-completion
> [agent's response on tier 3 design]

Reasoned: No new identifiers; nothing to do.
Cost: $0.0003 (cache hit)

## 14:35:22 — event: tribe-broadcast
> [push] beorn/silvery: feat(layout) wrap-policy
...
```

`tail -f`-able. Survives session crash. Useful for offline analysis + telemetry training.

### Implementation cost of visibility

- Side-panel pane: ~50 LOC + 1 storybook story
- Hover tooltip on ambient rows: ~30 LOC (extends existing AmbientEventRow popover)
- `/memory` inspector view: ~200 LOC (new screen + slash command)
- Journal file: ~20 LOC (append on each event in the sub-agent loop)

Total ~300 LOC visibility surface on top of ~300 LOC sub-agent core = ~600 LOC for the whole feature.

---

## Final shape (2026-04-27 23:42): mem-thought as long-running sub-agent with compiled knowledge

The user's full vision crystallizes through three additions:

1. **Per-event LLM review**: every new input triggers an LLM that reviews what it means and what searches to run next. Not just regex extraction — actual interpretation.
2. **Compiled knowledge**: the agent maintains a running structured digest of relevant prior context. This is the "memory state" — versioned, updateable, queryable.
3. **Delta vs full injection**: the foreground agent can either receive the whole compiled-knowledge snapshot OR only deltas (what's changed since last time). Memory is **kept in the sub-agent** with only deltas pushed to the foreground.

This makes mem-thought a **persistent in-session sub-agent** with its own LLM context, tools, and state — not a paced batch process and not a stateless reactive function.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│   FOREGROUND AGENT (Claude/Codex via ACP — silvercode user)  │
│                                                              │
│   sees ambient deltas:                                       │
│   [mem-thought, delta]: peer pushed wrap-policy; relevant?   │
│   [mem-thought, delta]: file change SidePanel.tsx — past...  │
│   [mem-thought, full] (on /clear or session-start):          │
│     <whole compiled knowledge digest>                        │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │ AmbientEvent emit
                          │
┌──────────────────────────────────────────────────────────────┐
│   MEM-THOUGHT SUB-AGENT (cheap LLM, prompt-cached context)   │
│                                                              │
│   Long-running conversation with claude-haiku-4-5:           │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ system: "You are the memory of this session..."        │ │
│   │ tools:  recall_search, qmd_query, read_chunk           │ │
│   │ ─────── PROMPT CACHED BOUNDARY ───────                 │ │
│   │ user: <event 1: user prompt>                           │ │
│   │ asst: <reasoned about it, called recall, saved to KB>  │ │
│   │ user: <event 2: tribe broadcast>                       │ │
│   │ asst: <updated KB, no emit needed>                     │ │
│   │ user: <event 3: file change>                           │ │
│   │ asst: <searched, found connection, emit delta>         │ │
│   │ ...                                                    │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                              │
│   Compiled knowledge (structured, in agent's context):       │
│     • Tracked identifiers + their relevance scores           │
│     • Hypotheses still being explored                        │
│     • Surfaced beads/sessions (what's been emitted)          │
│     • Summary of what the conversation is about              │
│     • Notes on what the foreground agent seems to need       │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │ session events
                          │
   ┌──────────┐  ┌────────┴────────┐  ┌──────────┐  ┌──────────┐
   │ prompts  │  │ tribe broadcasts │  │  files   │  │    CI    │
   └──────────┘  └─────────────────┘  └──────────┘  └──────────┘
```

The sub-agent has its OWN LLM context that grows as events arrive. Anthropic prompt caching means most of this context is cached — each event is a cache-hit + small append, cost is ~$0.001 per event in steady state.

### Compiled-knowledge schema

The sub-agent's state includes a structured "compiled-knowledge" document that gets updated as it reasons:

```markdown
# Compiled knowledge (cycle 5, 23:42)

## Conversation theme
Designing recall-thought tier of mem-* architecture. User wants iteratively-smart
LLM browser of FTS, with sub-agent maintaining compiled context.

## Active identifiers
- recallAgent (high relevance — 4 sessions discuss it)
- mem-thought (this design)
- /pro reviews on memory (3 prior critiques surfaced)
- "compiled knowledge" (new — searching now)

## Surfaced (already shown)
- session 6443387f — original recall agent design
- km-tribe.recall-thought — this bead

## Hypotheses being explored
- "compiled context" → searching qmd vault
- "Letta MemGPT memory tiers" → 1 weak hit, low confidence
- "agent loop with tool calls" → searching

## Open questions for next event
- Did user mean Letta-style memory tiers?
- Is there prior /pro work on agent loops to surface?
```

This is what the sub-agent thinks-out-loud about, in its own context. When emitting to the foreground, it produces either:

- **Delta**: "Since last update: searched X, found Y; new connection: Z." (~1–3 lines)
- **Full**: dump the compiled-knowledge document as an `[mem-thought, full-snapshot]` event

### Per-event review loop

```
onEvent(event):
  // Append event to sub-agent's conversation
  subAgent.appendUserMessage(formatEvent(event))

  // Step the sub-agent: it sees its full context (cached) + new event,
  // decides what to do. May call tools, may update internal KB, may emit.
  response = await subAgent.step({
    tools: [recall_search, qmd_query, read_chunk, emit_delta, emit_full],
    cacheStrategy: "prompt-cache",  // 90% cost reduction on cache hits
  })

  // The sub-agent's tool calls drive everything:
  for toolCall in response.toolCalls:
    switch toolCall.name:
      case "recall_search":
        result = recall(toolCall.args.query, { excludeSurfaced, ... })
        subAgent.appendToolResult(toolCall.id, result)
      case "emit_delta":
        opts.queue.enqueue({
          kind: "thought",
          mode: "delta",
          content: toolCall.args.summary,
        })
      case "emit_full":
        opts.queue.enqueue({
          kind: "thought",
          mode: "full",
          content: toolCall.args.compiledKnowledge,
        })

  // If sub-agent did tool calls, step again to let it react to results
  while response.hasToolCalls:
    response = await subAgent.step(...)
```

The sub-agent **decides**:
- Whether to search at all on this event ("user just said 'ok' — nothing to do")
- What to search for ("they mentioned 'compiled context' — let me search prior /pro reviews")
- Whether to emit ("found something relevant + non-stale + not surfaced — emit delta")
- Whether emit should be delta or full ("on /clear, send full snapshot to re-prime")
- Whether to update its internal KB without emitting ("noted, will surface if reinforced")

### Cost model with prompt caching

- Sub-agent context grows ~500 tokens/event
- Anthropic prompt cache: first token of new content = full price; rest = 10% (cache hit)
- Per event cost: ~$0.0005–0.002 (mostly cache hits + small append + occasional tool result)
- Per session: 100 events × $0.001 = **~$0.10/session**
- Heavy use (3 sessions/day, 5 days/week, 4 weeks/month): **~$5–8/dev/month**

This is comparable to my paced-wrapper estimate but with **continuous reactivity** rather than periodic batches.

### Why "delta" matters

The compiled-knowledge document grows over a session — by event 50, it's maybe 1500 tokens of structured notes. Injecting that into the foreground agent's context every emit is wasteful and noisy.

**Delta mode**: "Since last update: searched X, found Y." — 1–3 lines, easy to ignore-or-use.
**Full mode**: only on session-start, /clear, or explicit user request — re-primes the foreground agent with the whole memory snapshot.

This matches how human conversation works: you don't recite your entire memory on every turn, you mention specific recollections as they become relevant.

### Implementation sketch (~300 LOC)

```typescript
// apps/silvercode/src/ambient-adapters/memory-agent.ts
import Anthropic from "@anthropic-ai/sdk"
import { recall } from "@bearly/recall"

export function createMemoryAgent(opts: MemoryAgentOpts): MemoryAgent {
  const messages: Anthropic.MessageParam[] = []
  const surfaced = new Set<string>()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `You are the memory sub-agent for this Claude Code session.
You watch session events (user prompts, assistant completions, tribe broadcasts,
file changes, CI events) and maintain a compiled-knowledge document about prior
context that might be relevant to the current work.

You have tools:
- recall_search(query): search Claude Code session history (FTS5)
- qmd_query(query): search markdown knowledge bases (hybrid)
- emit_delta(summary): emit a short ambient event with new findings
- emit_full(compiledKnowledge): emit the full compiled-knowledge snapshot

On each event:
1. Decide what it means for the current task
2. Decide what (if anything) to search for
3. Update your internal compiled-knowledge mentally
4. Emit a delta if you find something useful + non-stale + not already surfaced

Bias toward silence. Most events should produce no emit.`

  async function onEvent(event: SessionEvent): Promise<void> {
    messages.push({ role: "user", content: formatEvent(event) })

    let response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
      max_tokens: 1500,
    })

    while (response.stop_reason === "tool_use") {
      const toolResults = []
      for (const block of response.content) {
        if (block.type !== "tool_use") continue
        const result = await dispatchTool(block, opts, surfaced)
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result })
      }
      messages.push({ role: "assistant", content: response.content })
      messages.push({ role: "user", content: toolResults })
      response = await client.messages.create({ ...same as above })
    }
    messages.push({ role: "assistant", content: response.content })
  }

  return { onEvent, dispose: () => { /* clear messages */ } }
}
```

Subscribe to events in the controller (same as before — feed everything to `onEvent`).

### Cost discipline

- Per-day cap (default $1/dev/day) — sub-agent stops accepting events when reached
- Per-event tool-call cap (default 3 per event) — prevents runaway loops
- Per-session conversation length cap (default 100 events) — clears or hibernates

---

## Ship plan (2026-04-28, locked): doubt-shaped, gated, kill-switchable

User-approved plan. Replaces the earlier "build-the-architecture-then-iterate" sequence with a "disprove-the-hypothesis-cheaply-then-invest" sequence.

### Day 1 — Cheapest hypothesis test (no code)

Shell script: every 5 minutes, run `bun recall --agent` against the last 10 turns of an active session, log results to a file. Manual eyeball at end of day — would these emits have been useful in the actual conversation?

- **Kill gate**: 0 of 10 useful → kill the project, save 6 weeks
- **Proceed gate**: 3+ of 10 useful → continue to Day 2

Bead: `km-tribe.recall-step1-hypothesis-test`

### Days 2–3 — Tier 2 v2 vs Tier 3 v0 A/B (∼150 LOC total)

Two cheap implementations behind env flags, run in parallel for 3–4 days:

- **Tier 2 v2** (∼50 LOC patch on `UserPromptSubmit` hook): skip-on-no-salience + per-(token,scope) dedup + outcome-aware ranking
- **Tier 3 v0** (∼100 LOC paced echo): subscribe to events, every 12 turns run `bun recall --agent` on synthetic query, emit raw hits — no LLM packaging, no compiled state, no tools

Decide which (or both) is worth investing in. Tier 2 v2 might give 80% of the value at 10% of the work — that's worth knowing.

Beads: `km-tribe.recall-step2-tier2v2-stub`, `km-tribe.recall-step3-tier3v0-stub`

### Day 4 — Real Deep Research API web sweep (∼$5, 15 min)

Closes the Oct 2024 cutoff gap from the earlier `/deep` audit. Already missed Hermes Agent (Feb 2026); other things may have shipped. Updates moat thesis.

Bead: `km-tribe.recall-step4-prior-art-2025-26`

### Week 2 — Tier 3 v1 + visibility (only if A/B says yes)

Build the sub-agent (∼300 LOC) and side-panel/tooltip/journal **in parallel**. gbrain conventions adopted as we go (drafts of compiled-state format + dream-cycle protocol live, refined in code).

Sub-bead: `km-tribe.recall-thought` (existing)
Companion bead: `km-tribe.recall-thought-visibility`

### Week 3 — Honest decision point

- Kill criteria triggered (`useful_emit_rate < 20%`, daily-cost > $5, foreground-agent visibly distracted) → stop
- Useful but expensive → tighten cadence + tools
- Useful and cheap → continue to Week 4
- Surprisingly useful for non-memory things → **pivot** to compiler/lint/critic sub-agent which are easier to validate

### Weeks 4–8 — Either Tier 4 mem-dream OR alternate sub-agent

Same gate-then-invest pattern. gbrain dream-cycle adapted as we apply it.

### Topology B+C (deferred)

Daemon move (Topology B) only when state-survival becomes felt pain. Cloud proxy (Topology C) only when distribution becomes a real product question. Don't build for hypothetical needs.

### Kill-switch metrics

Tracked from Day 1 onward via `silvercode:ambient` loggily namespace:

```
useful_emit_rate = emits_referenced_in_next_2_turns / total_emits
daily_cost_usd   = sum(per-event costs)
distraction_signal = manual user thumbs-down per session
```

Thresholds:
- `useful_emit_rate < 20% sustained over 1 week` → kill or pivot
- `daily_cost_usd > $5/dev` → tighten gates
- `distraction_signal > 1/day` → reduce cadence

### What I'm explicitly NOT doing in v1

- Multi-corpus search (qmd, gbrain) — single corpus first
- Tool-call agent loop — paced wrapper first
- LSP/git/bd tools — recall_search only
- Cross-session dedup persistence — per-session is enough
- Cloud deployment — local only
- agentskills.io interop — different problem
- User-facing docs — until the thing is useful

### Compounding shift

The earlier plan was **confidence-shaped** ("build, ship, iterate"). This plan is **doubt-shaped** ("disprove cheaply, invest in what survives"). For a novel composition with unproven user value, doubt-shaped wins.

- **Time-to-yes-or-no**: 4 days
- **Time-to-platform-claim**: 6–8 weeks IF early gates pass; 0 weeks if they don't

The riskiest cut from the earlier plan is the "adopt-gbrain-first" step — kept available as draft references but not blocking.

---

## Reactive evolution (2026-04-27 23:38): mem-thought as stateful in-session agent

User reframe: the memory itself should be a stateful agent that maintains compiled context and updates incrementally on new events (tribe broadcasts, file changes, prompts), instead of re-searching from scratch each cycle.

This is genuinely different architecture: **event-driven push-based reactive agent** vs **time-paced pull-based batch pipeline**. It matches how human memory works in conversation — not a periodic re-evaluation, but a continuous background process that pings on new signal.

### State shape

```typescript
type MemoryAgentState = {
  // Running summary: what the conversation is about right now
  summary: string  // ~6 lines, updated on each event

  // Tracked identifiers extracted from the conversation
  identifiers: Map<string, {
    type: "path" | "error" | "bead-id" | "function" | "phrase" | "peer-event"
    weight: number   // type weight × frequency
    firstSeen: number
    lastSeen: number
    status: "new" | "searched" | "surfaced" | "dropped"
  }>

  // Active search hypotheses — each is a query that's been run
  hypotheses: Array<{
    query: string
    sourceIdentifiers: string[]
    hits: Hit[]              // raw FTS results
    coverageScore: number    // freshness × hit count × outcome weights
    lastEvaluated: number
    surfaced: boolean
  }>

  // Dedupe — what's already been emitted
  surfaced: Set<beadId>

  // Budget tracking
  budget: {
    remainingCycles: number   // cap per session
    remainingSpend: number    // USD per day
    lastSearchAt: number      // rate-limit
  }

  // Emission queue
  pending: Emission[]
}
```

### Event-driven algorithm (pseudocode)

```
onEvent(event):
  // Step 1: Mechanical state update (no LLM, no FTS) — runs on every event
  switch event.type:
    case "user-prompt" | "assistant-completion":
      ids = extractIdentifiers(event.text)         // regex: paths, errors, kebab-IDs, etc
      for id in ids:
        upsertIdentifier(id, weightedByType(id))
      summary = updateRollingSummary(summary, event.text)

    case "tribe-broadcast":
      ids = extractIdentifiers(event.preview)
      for id in ids:
        upsertIdentifier(id, weight: 0.7 × weightedByType(id))   // peer signal weighted lower
      // Special: peer commits / PRs / CI events may directly suggest
      //   a search: "peer just shipped wrap-policy" → search for "wrap policy"

    case "file-change":
      upsertIdentifier(event.path, weight: 2.0)   // file paths are high-signal
      // Also: extract the basename and module name as separate anchors

    case "ci-status":
      upsertIdentifier(event.checkName, weight: 1.5)
      if event.failed: upsertIdentifier(event.errorPattern, weight: 2.5)

  // Step 2: Decide if any work needs doing — most events end here
  newIds = identifiers.where(status === "new")
  if newIds.empty AND !rateLimitExpired:
    return    // nothing new, nothing to do

  // Step 3: For each NEW high-weight identifier, search (cheap, no LLM)
  for id in newIds.where(weight >= HIGH_WEIGHT_THRESHOLD):
    hits = recall(buildQueryFor(id, identifiers), since: "30d",
                  excludeCurrentSession: true, excludeSurfaced: surfaced)
    if hits.empty:
      identifiers[id].status = "searched-empty"
    else:
      hypotheses.push({
        query: id,
        sourceIdentifiers: [id],
        hits,
        coverageScore: rank(hits, identifiers, surfaced),
        lastEvaluated: now,
        surfaced: false,
      })
      identifiers[id].status = "searched"

  // Step 4: Optional cheap-LLM cross-pollination (every K events, e.g., K=10)
  if eventsSinceLastLlm >= K AND newIds.count >= 2:
    // Single LLM call: "Given these identifiers and current summary,
    //   are there cross-cutting queries worth running?"
    //   Returns 1-3 multi-anchor combinations (e.g., "wrap regression mobile")
    crossQueries = llmCrossPollinate(summary, newIds, hypotheses)
    for q in crossQueries:
      hits = recall(q, ...)
      if hits.length > 0: hypotheses.push({...})

  // Step 5: Re-rank ALL hypotheses (no LLM, just math)
  for h in hypotheses:
    h.coverageScore = rerank(h.hits, identifiers, surfaced)
    // Hypothesis becomes "stale" once most of its hits are surfaced

  // Step 6: Decide what to emit (pick best unmarked hypothesis above threshold)
  best = hypotheses.where(!surfaced && coverageScore > EMIT_THRESHOLD)
                   .maxBy(h => h.coverageScore)
  if best:
    // Optional cheap-LLM digest composition (or templated if utility is high enough)
    digest = composeDigest(best, summary)   // ~$0.001 if LLM, else templated
    emit(digest)
    best.surfaced = true
    for hit in best.hits: surfaced.add(hit.beadId)
    budget.remainingCycles--

  // Step 7: Garbage-collect stale state
  evictOldHypotheses(hypotheses, AGE_THRESHOLD)
  evictOldIdentifiers(identifiers, AGE_THRESHOLD)
```

**Key property**: most events are O(1) — extract identifiers, update map, decide nothing-to-do, return. Only events that introduce new high-weight identifiers trigger FTS calls. Only every-K events trigger an LLM call. Most cycles emit nothing (silent on no-signal). The agent does work *proportional to new signal*, not on a fixed schedule.

### Example surfacing scenarios

**Scenario A — user mentions a known bug**
```
event:    user-prompt "remember the wrap regression bug?"
extract:  identifiers ["wrap regression"] (kebab-phrase, weight 2.5)
search:   recall("wrap regression") → 3 hits:
            - km-tui.wrap-regression [RESOLVED] flex-wrap fix, 2026-04-15
            - session 0420 retest, 2026-04-20
            - km-flexx.wrap-height [SUPERSEDED]
hypothesis added, coverage 2.5+1.5+0.6 = 4.6 → above threshold
emit:     [mem-thought, cycle 1 — query: "wrap regression"]
            • [RESOLVED 2026-04-15] km-tui.wrap-regression — flex-wrap fix
            • [follow-up 2026-04-20] session 0420 retested on mobile
            • [SUPERSEDED] km-flexx.wrap-height — see canonical above
mark surfaced: {km-tui.wrap-regression, session-0420, km-flexx.wrap-height}
```

**Scenario B — user says "we should ship this"**
```
event:    user-prompt "we should ship this"
extract:  identifiers ["ship"] (generic, weight 0.5)
search:   no high-weight new identifiers, skip
LLM:      no, K-events not reached
emit:     nothing — silent
```

**Scenario C — peer commit lands during your work on related file**
```
event:    tribe-broadcast {kind: github-push, preview:
            "feat(layout): wrap-policy improvements in @silvery/flexily"}
extract:  identifiers ["wrap-policy", "silvery", "flexily"] from preview
          (peer-event weight × type weights)
new:      "wrap-policy" is genuinely new and high-weight
search:   recall("wrap-policy") in cross-sessions → 2 hits:
            - past discussion of wrap policy semantics, 2026-04-12
            - design doc on flexily wrap behavior
hypothesis added, coverage 2.8 → above threshold
emit:     [mem-thought, cycle 2 — peer activity in @silvery/flexily]
            Peer just pushed wrap-policy improvements (@silvery/flexily).
            Past discussions:
            • Session 0412 — wrap-policy semantics
            • hub/silvery/design/flexily-wrap.md — design notes
```

**Scenario D — file change introduces new context**
```
event:    file-change "apps/silvercode/src/components/SidePanel.tsx"
extract:  identifier "apps/silvercode/src/components/SidePanel.tsx" (path, weight 2.0)
          plus "SidePanel.tsx" basename (weight 1.5)
new:      yes (file path)
search:   recall("SidePanel.tsx") → 5 hits across sessions:
            - past bug fixes, design discussions, focus-bar work
already surfaced: {km-silvercode.welcome-card-hidden}  // from earlier emit
filter out surfaced; remaining hits coverage 2.1 → above threshold
emit:     [mem-thought, cycle 3 — SidePanel.tsx context]
            Past SidePanel work not previously surfaced this session:
            • Session 0424 — focus-bar layout decisions
            • km-silvercode.side-panel-design — Sessions/Todos/Mode shape
```

**Scenario E — re-firing on the same hypothesis after new event reinforces it**
```
event 1:  user-prompt "the wrap thing was broken on mobile"
extract:  identifier "wrap thing" (weight 1.0), "mobile" (weight 1.0)
search:   recall("wrap mobile") → 1 weak hit, coverage 0.9 — below threshold
hypothesis kept as latent (not emitted)

(several events pass without action)

event 5:  assistant-completion mentions "flex-wrap"
extract:  identifier "flex-wrap" (weight 2.0)
re-rank:  latent hypothesis "wrap mobile" + new "flex-wrap" combine →
          cross-pollinate query "flex-wrap mobile wrap regression" via cheap LLM
          new hits found, combined coverage 3.4 → emit
emit:     [mem-thought, cycle 1 — pattern recognized across turns]
            ...
```

### Deduplication mechanics

Three layers:

1. **Identifier deduplication** — same identifier extracted multiple times just bumps `lastSeen` and `count`; no re-search until `status` resets to "new" via TTL or new context.

2. **Hypothesis surfacing** — once a hypothesis has been emitted, `surfaced: true`. Its hits are added to the global `surfaced` set. Hypotheses are re-ranked on every event but won't re-emit. Stale hypotheses (most hits surfaced) get evicted.

3. **Cross-hypothesis dedup** — when ranking, hits already in the global `surfaced` set get coverage-zeroed. So even if a NEW hypothesis would surface bead-X, if bead-X was already shown, the hypothesis won't include it; if bead-X was the hypothesis's only good hit, the hypothesis falls below threshold and stays silent.

The `surfaced` set is per-session (cleared on new session). Cross-session persistence is opt-in v3.

### Why this beats the paced wrapper

| Property | v1 paced wrapper | v2 reactive agent |
|----------|------------------|-------------------|
| Trigger | Every 12 turns / 15 min | Any event with new signal |
| Most events do | Nothing (waiting for cadence) | O(1) state update only |
| Re-search cost | Full FTS expansion every cycle | Incremental — search only new IDs |
| Cross-event signal | Lost between cycles | Accumulates in state.identifiers |
| Peer-driven recall | Misses unless cycle aligns | Tribe broadcast IS an event — fires immediately |
| Dedup | Set + recallAgent's internal tracking | Per-session surfaced set + hypothesis lifecycle |
| Cost ceiling | $0.011/cycle × N cycles | $0.001/event in steady state, $0.01 only on FTS-needed events |
| Code surface | ~50 LOC | ~200–250 LOC (state machine + handlers) |

### Implementation sketch (~200 LOC)

```typescript
// apps/silvercode/src/ambient-adapters/memory-agent.ts
export function createMemoryAgent(opts: MemoryAgentOpts): MemoryAgent {
  const state: MemoryAgentState = {
    summary: "",
    identifiers: new Map(),
    hypotheses: [],
    surfaced: new Set(),
    budget: { remainingCycles: 8, remainingSpend: 1.0, lastSearchAt: 0 },
    pending: [],
  }

  function extractIdentifiers(text: string): Anchor[] { /* regex */ }
  function upsertIdentifier(id: string, weight: number): void { /* state update */ }
  function rerank(hits: Hit[], state: ...): number { /* outcome + freshness */ }

  async function onEvent(event: SessionEvent): Promise<void> {
    // Step 1: mechanical state update (no LLM, no FTS)
    updateStateFromEvent(state, event)

    // Step 2: short-circuit if nothing new
    const newIds = [...state.identifiers].filter(([_, m]) => m.status === "new" && m.weight >= 1.5)
    if (newIds.length === 0 && Date.now() - state.budget.lastSearchAt < RATE_LIMIT_MS) return

    // Step 3: search per new high-weight identifier
    for (const [id, meta] of newIds) {
      const hits = await recall(buildQuery(id, state), { since: "30d", crossSession: true })
      if (hits.length > 0) {
        state.hypotheses.push({ query: id, hits, coverageScore: rerank(hits, state), ... })
      }
      meta.status = hits.length > 0 ? "searched" : "searched-empty"
    }

    // Step 4: optional cross-pollination LLM call (every K events)
    if (state.eventsSinceLastLlm >= 10 && newIds.length >= 2) {
      const crossQueries = await llmCrossPollinate(state.summary, newIds, state.hypotheses)
      for (const q of crossQueries) {
        const hits = await recall(q, { ... })
        if (hits.length > 0) state.hypotheses.push({...})
      }
    }

    // Step 5: re-rank
    for (const h of state.hypotheses) h.coverageScore = rerank(h.hits, state)

    // Step 6: emit best
    const best = pickBest(state.hypotheses, EMIT_THRESHOLD)
    if (best && state.budget.remainingCycles > 0) {
      const digest = composeDigest(best, state.summary)
      opts.queue.enqueue(digest)
      best.surfaced = true
      best.hits.forEach((h) => state.surfaced.add(h.beadId))
      state.budget.remainingCycles--
    }

    // Step 7: GC
    evictStale(state)
  }

  return { onEvent, getState: () => state, dispose: () => { /* cleanup */ } }
}
```

Subscribe to events in the controller:

```typescript
// apps/silvercode/src/controller.ts
const memoryAgent = createMemoryAgent({ queue: channelQueue, repoScope })
sessionStore.on("user-prompt", (p) => memoryAgent.onEvent({ type: "user-prompt", text: p }))
sessionStore.on("assistant-completion", (c) => memoryAgent.onEvent({ type: "assistant-completion", text: c }))
tribeAdapter.on("broadcast", (e) => memoryAgent.onEvent({ type: "tribe-broadcast", preview: e.preview }))
filewatchAdapter.on("change", (p) => memoryAgent.onEvent({ type: "file-change", path: p }))
ciAdapter.on("status", (s) => memoryAgent.onEvent({ type: "ci-status", ...s }))
```

### Cost & latency

- Steady state (no new identifiers): ~0 ms, $0 per event
- New high-weight identifier: ~600 ms FTS, $0 per event
- LLM cross-pollination (every ~10 events): ~1–2 s, ~$0.001
- LLM digest composition (when emitting): ~1–2 s, ~$0.001
- Per session: 5–8 emissions × ~$0.005 LLM cost + ~20–50 FTS calls × $0 = **~$0.05/session**
- Heavy use: ~$5–10/dev/month

Roughly the same cost as the paced wrapper but with: (a) better timing (fires when signal is fresh, not on cadence), (b) accumulated cross-event signal (latent hypothesis from event 1 fires after event 5 reinforces it — Scenario E), (c) reactive to peer activity (tribe broadcasts ARE events).

### Implementation roadmap (revised)

| Phase | Scope | LOC | Dogfood signal |
|-------|-------|-----|----------------|
| v1 | Reactive agent skeleton: state + event handlers + identifier extraction + FTS + outcome ranking + emit | ~200 | First emissions on user prompts containing high-weight IDs |
| v1.5 | Cross-pollination LLM call (every K events) + digest composition LLM call | +50 | Better hypothesis quality, terser emissions |
| v2 | Persistent dedup across sessions per project | +30 | Don't re-surface same bead in new session within 24h |
| v3 | qmd as second substrate (besides recall FTS) | +50 | Vault content surfaces alongside session history |
| v4 | True tool-call agent loop for complex hypotheses (escalation only) | +100 | Catches things v1's structural extraction misses |

---

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

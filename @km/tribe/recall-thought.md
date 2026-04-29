---
id: "@km/tribe/recall-thought"
aliases:
  - km-tribe.recall-thought
  - km-tribe-recall-thought
created_by: claude:4de4a3ab
created_at: 2026-04-27T22:31:17Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-thought
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-27T16:10:44Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-thought
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-27T23:35:21Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Mem thought (Tier 3): private context sub-agent — LSP + memory + delta injection + visibility UI @km/tribe #feature #P2

blocks:: [[@km/tribe/recall]], [[@km/tribe/recall-eval-corpus]]

# Tier 3 — mem thought (recall-thought)

Long-running in-session sub-agent that maintains compiled-knowledge state and emits incremental deltas as new events arrive.

## Final shape (2026-04-27 23:42)

mem-thought is a **persistent sub-agent** with its own LLM context (claude-haiku-4-5, prompt-cached), watching all session events:

- user prompts
- assistant completions
- tribe broadcasts (peer activity)
- file changes
- CI events

On each event:
1. LLM reviews what it means for current work
2. Decides which searches to run (recall, qmd)
3. Updates internal compiled-knowledge document
4. Emits delta to foreground agent ONLY if useful + non-stale + not already surfaced

Foreground agent receives:
- **Delta mode**: 1-3 line ambient events as new findings emerge
- **Full mode**: whole compiled-knowledge snapshot on session-start / /clear / user request

## Why this beats one-shot batch designs

- Reactive: fires when signal is fresh, not on cadence
- Stateful: accumulates across events (latent hypothesis from event 1 fires after event 5 reinforces)
- Peer-aware: tribe broadcasts ARE events — surfaces immediately when peer commits relevant code
- Cost-bounded: prompt-cached context, ~$0.001/event in steady state, ~$5-8/dev/month heavy use
- Delta-not-snapshot: doesn't pollute foreground with whole memory on every turn

## Implementation

~300 LOC at apps/silvercode/src/ambient-adapters/memory-agent.ts

Anthropic SDK conversation loop with tool-use + prompt caching. Tools:
- recall_search(query) — FTS5 session history
- qmd_query(query) — hybrid markdown vault search (v2)
- read_chunk(id) — full chunk fetch
- emit_delta(summary) — ambient event with finding
- emit_full(compiledKnowledge) — snapshot dump

## Acceptance

- npx tsc --noEmit non-vendor: 0 errors
- bun vitest run apps/silvercode/tests/ambient-adapters/memory-agent: all pass
- Smoke: dogfood for 1 session of normal silvercode work; observe ≥3 useful delta emits
- Cost: per-session <$0.20, per-day cap enforced
- Telemetry: silvercode:ambient namespace with event/tool/emit counts

## Design doc

hub/tribe/design/recall-thought.md (full design + iteration history + scenarios)

## Roadmap

v1 — sub-agent + recall_search tool only, delta + full emit modes (~300 LOC)
v2 — qmd_query as second substrate
v3 — cross-session persistent surfaced set
v4 — read_chunk for deeper investigation

## Parent

@km/tribe/recall (four-tier umbrella)
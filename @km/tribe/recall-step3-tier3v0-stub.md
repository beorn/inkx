---
id: "@km/tribe/recall-step3-tier3v0-stub"
aliases:
  - km-tribe.recall-step3-tier3v0-stub
  - km-tribe-recall-step3-tier3v0-stub
created_by: claude:4de4a3ab
created_at: 2026-04-28T01:52:23Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-step3-tier3v0-stub
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-27T18:52:22Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-step3-tier3v0-stub
    depends_on_id: km-tribe.recall-step1-hypothesis-test
    type: blocks
    created_at: 2026-04-27T18:52:24Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Step 3 (Days 2-3): Tier 3 v0 stub — paced echo, no LLM, raw FTS hits @km/tribe #task #P2

blocks:: [[@km/tribe/recall]], [[@km/tribe/recall-step1-hypothesis-test]]

# Step 3 — Tier 3 v0 stub (~100 LOC)

Minimal mem-thought: subscribe to events, every 12 turns run `bun recall --agent` on synthetic query, emit raw hits as ambient observation. NO LLM packaging, NO compiled state, NO tools beyond recall.

## Why

Validates basic shape (cadence + emit format) before investing in sub-agent architecture, prompt caching, compiled-knowledge state. If raw paced echo doesn't feel useful, the more sophisticated version won't either.

## Acceptance

- Stub lives at apps/silvercode/src/ambient-adapters/percolate-v0.ts
- Behind env flag SILVERCODE_TIER3_V0=1
- A/B against Step 2 (Tier 2 v2) for 3-4 days dogfood
- Decision: kill, keep paced echo + iterate, OR proceed to v1 sub-agent (Week 2)

## Parent

@km/tribe/recall (four-tier memory architecture)
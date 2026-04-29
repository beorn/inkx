---
id: "@km/tribe/recall-step2-tier2v2-stub"
aliases:
  - km-tribe.recall-step2-tier2v2-stub
  - km-tribe-recall-step2-tier2v2-stub
created_by: claude:4de4a3ab
created_at: 2026-04-28T01:52:22Z
---

# [ ] Step 2 (Days 2-3): Tier 2 v2 stub — UserPromptSubmit hook with skip-on-no-salience + dedup + outcome-rank @km/tribe #task #P2

blocks:: [[@km/tribe]], [[@km/tribe/recall-step1-hypothesis-test]]

# Step 2 — Tier 2 v2 stub (~50 LOC)

Patch the existing UserPromptSubmit hookRecall path with three improvements:

1. Skip-on-no-salience: if prompt has no recallable identifier (regex extract for paths/errors/kebab-IDs/backticked tokens), inject NOTHING. Most turns get no recall blob.
2. Per-(token, scope) dedup: never re-inject same chunk in one session.
3. Outcome-aware ranking: filter by bead status (RESOLVED / SUPERSEDED / REJECTED / EXPLORATORY) when available; downrank REJECTED.

## Why

The Tier 2 design we deferred. Likely gives 80% of the value of building Tier 3 from scratch, at 10% of the work.

Compare against Step 3 (Tier 3 v0) over 3-4 days dogfooding. Decide which is worth investing in for v1.

## Acceptance

- Patch lives behind env flag SILVERCODE_TIER2_V2=1
- A/B comparison data captured in bead notes after 3-4 days dogfood
- Decision: kill, keep, or invest further

## Parent

@km/tribe/recall (four-tier memory architecture)
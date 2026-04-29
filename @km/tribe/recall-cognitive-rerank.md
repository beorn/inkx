---
id: "@km/tribe/recall-cognitive-rerank"
aliases:
  - km-tribe.recall-cognitive-rerank
  - km-tribe-recall-cognitive-rerank
created_by: claude:4de4a3ab
created_at: 2026-04-28T07:06:07Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-cognitive-rerank
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-28T00:06:24Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-cognitive-rerank
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-28T00:06:07Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Post-hoc cognitive type rerank (ENGRAM-inspired, read-side only) @km/tribe #feature #P3

blocks:: [[@km/tribe]], [[@km/tribe/recall-eval-corpus]]

# Why

ENGRAM's headline finding: cognitive type separation (episodic / semantic / procedural) is worth +31% accuracy. The proper implementation tags content at ingest — that's a storage rethink and lives on the brain.md roadmap.

But we can adopt a *post-hoc* version with zero storage change: take top-50 from FTS, classify each result by cheap LLM into fact / event / instruction / decision, return top-K per type. Most of the value, none of the storage cost.

User's caveat (2026-04-27): \"i don't think any of them have tried a sub-agent trying to maintain memory though.\" Right — none of the published systems have a sub-agent. The cognitive-type rerank is a substrate improvement (not a sub-agent feature) and is independent of @km/tribe/recall-thought.

# What

After FTS5 returns top-50 candidates:
1. Single batched LLM call: \"classify each snippet as fact|event|instruction|decision\"
2. Group by category, take top-K per category (K=3 each → 12 total)
3. Return categorized result set; agent sees type tags in the digest

Cost: ~\$0.001/query for batched haiku classification. Latency: ~500ms.

# Acceptance gate

@km/tribe/recall-eval-corpus must show ≥15% precision@5 lift on adversarial pairs (queries with mixed-type expected results). If only flat-text queries benefit, the LLM call isn't justified.

# Depends on

@km/tribe/recall-eval-corpus (need labeled type data to grade type-aware ranking)

# Storage-side counterpart (deferred)

The full ENGRAM design tags content at ingest, allowing per-type FTS5 indexes (filter at search time, not after). That's tracked under brain.md roadmap as a Phase 2 storage feature. This bead adopts the pure read-side benefit first.
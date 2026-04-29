---
id: "@km/tribe/recall-multipath-rrf"
aliases:
  - km-tribe.recall-multipath-rrf
  - km-tribe-recall-multipath-rrf
created_by: claude:4de4a3ab
created_at: 2026-04-28T07:05:56Z
---

# [ ] Multi-pathway retrieval with reciprocal rank fusion (read-side, zero storage change) @km/tribe #feature #P3

blocks:: [[@km/tribe]], [[@km/tribe/recall-eval-corpus]]

# Why

Adopt Hindsight TEMPR's read-side innovation without storage changes. Run FTS keyword + recency-weighted + session-proximity queries in parallel, fuse with reciprocal rank fusion. Pure pipeline assembly — no new indexes, no storage schema changes.

Per docs/explorations/memory-systems-analysis.md Phase 3: \"~5 hours work, high expected impact\".

# What

3 parallel SQLite queries against existing FTS5 index:
1. FTS5 keyword match (current default)
2. Recency-weighted (boost recent sessions, decay older)
3. Session-proximity (messages near other already-relevant messages — boost when the same session ID appears in multiple sub-results)

Merge via reciprocal rank fusion: \`score(doc) = Σ 1/(k + rank_i)\` where k=60, rank_i is the doc's rank in pathway i. Standard RRF formula.

# Acceptance gate

@km/tribe/recall-eval-corpus must show ≥10% precision@5 lift vs single-pathway baseline. If not, the extra latency isn't worth it.

# Depends on

@km/tribe/recall-eval-corpus (must measure A/B before this ships)

# Notes

This is the read-side analog of Hindsight's TEMPR (Temporal-Entity-Multi-Pathway Retrieval). The full TEMPR also fuses entity-graph and embedding pathways — those need storage rethink and are tracked under the brain.md roadmap, not here.
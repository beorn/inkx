---
id: "@km/tribe/recall-eval-longmemeval"
aliases:
  - km-tribe.recall-eval-longmemeval
  - km-tribe-recall-eval-longmemeval
created_by: claude:4de4a3ab
created_at: 2026-04-28T07:05:50Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-eval-longmemeval
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-28T00:05:53Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-eval-longmemeval
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-28T00:05:53Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Score recall pipeline on LongMemEval public benchmark (substrate sanity floor) @km/tribe #task #P3

blocks:: [[@km/tribe]], [[@km/tribe/recall-eval-corpus]]

# Why

External sanity floor for the substrate retrieval pipeline. Our hand-labeled corpus (@km/tribe/recall-eval-corpus) tests @km/_orphan/specific behaviors; LongMemEval tests whether our pipeline is generally competent at conversational memory.

LongMemEval (Wu et al., 2024) — ~500 hand-curated questions over long conversations, categorized by reasoning type: knowledge update, temporal reasoning, multi-session synthesis, single-fact recall. Closest published benchmark to mem-thought's substrate. SOTA: Hindsight 91.4%; Mem0 graph 68.5%; Letta filesystem 74%.

Note: this measures the SUBSTRATE only (FTS + planner + reranker). The Tier 3 sub-agent (@km/tribe/recall-thought) is orthogonal — none of the published systems have a sub-agent maintaining memory across turns, so there's no public benchmark for that.

# What

- Download LongMemEval public test set (knowledge-update + temporal-reasoning subsets initially)
- Adapter: convert each (conversation, question) → query against current pipeline
- Score: accuracy on substrate retrieval (was the right past message in top-K?)
- Compare: baseline / salience-trigger / drop-synthesis / cognitive-rerank / multipath-rrf variants
- Document where we land vs. published numbers

# Acceptance gate

- Score ≥ Mem0 baseline (~68%) on knowledge-update subset → substrate is competent
- Score < random baseline → pipeline has a bug
- Don't gate downstream beads on this; it's a sanity floor, not a precision target

# Cost

~\$50-\$100 in LLM calls for one full pass across all 4 variants. Use cheap-judge mode where possible.

# Depends on

@km/tribe/recall-eval-corpus (corpus + runner come first; LongMemEval reuses the runner)
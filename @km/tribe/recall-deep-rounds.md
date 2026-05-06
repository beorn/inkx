---
mentions:
  - km
id: "@km/tribe/recall-deep-rounds"
aliases:
  - km-tribe.recall-deep-rounds
  - km-tribe-recall-deep-rounds
created_by: claude:4de4a3ab
created_at: 2026-04-28T07:10:29Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-deep-rounds
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-28T00:10:29Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-deep-rounds
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-28T00:10:30Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tribe.recall
      - type: link
        target: km-tribe.recall-eval-corpus
---

# [ ] Deep agent rounds — extend LLM↔search inner-loop beyond max-rounds=2 @km/tribe #feature #P2

blocks:: [[@km/tribe/recall]], [[@km/tribe/recall-eval-corpus]]

## Why

User hypothesis (2026-04-28): \"i THINK that the value might be in a tight multi-turn llm+search loop\". The retrieval win may live within ONE user prompt — multiple LLM↔search rounds per query — rather than ACROSS multiple user prompts (compiled-state model in @km/tribe/recall-thought).

\`bun recall --agent --max-rounds 2\` already does this for 2 rounds. The hypothesis: more rounds + smarter inter-round refinement (LLM sees actual snippets, writes better queries) keeps lifting precision until budget runs out.

## What

Extend recall agent's planner loop:

1. Round 1: planner generates K initial query variants from brief
2. Fanout, rerank
3. Round 2..N: planner SEES round-(N-1) snippets, identifies gaps (\"these results suggest the user wanted X but I haven't searched for X\"), generates new variants
4. Stop when: precision plateaus (last 2 rounds added no new top-K hits) OR budget exhausted (N ≤ 6, ≤ \$0.05/query)

## Acceptance gate

@km/tribe/recall-eval-corpus must show monotonic precision@5 lift across max-rounds=1, 2, 4, 6. If the curve plateaus at 2 (current default), this bead closes — extra rounds don't earn their cost.

If precision keeps climbing AND inner-loop is enough to clear the corpus targets, then @km/tribe/recall-thought (compiled-state sub-agent) is likely over-engineering — close it as superseded.

## Depends on

@km/tribe/recall-eval-corpus (need precision@5 measurement to grade this)

## Cost framing

Per query: \$0.005 (current 2-round) → \$0.015-\$0.025 (4-6 rounds). Worth it if precision lifts ≥20%. If not, stay at 2.

## Composes with

- @km/tribe/recall-salience-trigger: deep rounds only fire when salience trigger says \"do it\"
- @km/tribe/recall-drop-synthesis: synthesis is per-query, not per-round; orthogonal
- @km/tribe/recall-multipath-rrf: each round can fan out across multiple pathways


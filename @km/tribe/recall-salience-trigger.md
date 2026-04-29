---
id: "@km/tribe/recall-salience-trigger"
aliases:
  - km-tribe.recall-salience-trigger
  - km-tribe-recall-salience-trigger
created_by: claude:4de4a3ab
created_at: 2026-04-28T06:33:20Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-salience-trigger
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-27T23:33:27Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-salience-trigger
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-27T23:33:27Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Replace 5-min wall-clock probe with salience-change trigger @km/tribe #feature #P2

blocks:: [[@km/tribe/recall]], [[@km/tribe/recall-eval-corpus]]

# Why

The Step 1 polling probe (\`tools/mem-thought-hypothesis.ts\`, 5-min interval) burns ~\$0.01 per progressed turn on cycles that ignore conversational state. Even with skip-on-no-progress + 5-strategy rotation (commit \`d43f98e7d\`), the eyeball verdict on 4 live cycles was noise-leaning: queries fire on rotation index, not on what changed in the conversation.

A salience-driven trigger fires only when the brief's salient surface (mentioned tokens / beads / file paths) materially shifts. This eliminates clock-cycle waste AND aligns the probe with the actual signal — \"new things to look up\" — instead of an arbitrary timer.

# Design

Replace \`buildQuery\`'s rotation logic with a token-set diff:

\`\`\`
salience(brief) = mentionedTokens ∪ mentionedBeads ∪ mentionedPaths
shouldFire(brief, lastSalience) = jaccardDistance(salience(brief), lastSalience) > T
\`\`\`

When \`shouldFire\` is true, build a query from the *new* tokens/beads/paths (the ones not in lastSalience). The threshold T tunable; baseline T=0.3.

# Acceptance gate

@km/tribe/recall-eval-corpus must be running. Then:
- precision@5 increases by ≥10% vs baseline polling probe on the corpus
- mean cost-per-progressed-turn decreases (target: ≤50% of baseline)
- per-thread redundancy (Q2) measurable — does salience-trigger reduce duplicate retrievals across consecutive turns?

If precision improves but cost regresses, abort. If precision drops, abort. The eval corpus is the gate.

# Depends on

@km/tribe/recall-eval-corpus (must exist + have ≥30 pairs before this bead can ship)
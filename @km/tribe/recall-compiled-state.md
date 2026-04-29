---
id: "@km/tribe/recall-compiled-state"
aliases:
  - km-tribe.recall-compiled-state
  - km-tribe-recall-compiled-state
created_by: claude:4de4a3ab
created_at: 2026-04-28T06:34:06Z
closed_at: 2026-04-28T06:35:31Z
close_reason: Duplicate of km-tribe.recall-thought (Tier 3 sub-agent — same
  concept, exists since 2026-04-27). Folded eval-gate clarification + 40%
  per-thread overlap floor into recall-thought notes + added dep on
  recall-eval-corpus. This bead's framing was redundant.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-compiled-state
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T23:34:07Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-compiled-state
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-27T23:34:06Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-compiled-state
    depends_on_id: km-tribe.recall-salience-trigger
    type: blocks
    created_at: 2026-04-27T23:34:06Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [x] Compiled-state sub-agent for multi-turn retrieval caching @km/tribe #feature #P3

blocks:: [[@km/tribe]], [[@km/tribe/recall-eval-corpus]], [[@km/tribe/recall-salience-trigger]]

# Why

Long-running sub-agent with prompt cache holds compiled knowledge of the active conversation; the hook reads its current view instead of the probe redoing FTS searches per turn. Originally the headline plan for Tier 3 (recall-thought).

User's clarification (2026-04-27): \"compiled-state is valuable IF we find that there's value in compiling more state — it's an optimization, a multi-turn value-add.\" Not foundational. Earns its keep only if multi-turn redundancy is real.

# Acceptance gate (falsifiable)

@km/tribe/recall-eval-corpus Q2 must show ≥40% per-thread overlap of top-K surfaced sessions across consecutive turns. If overlap is <40%, each turn surfaces fresh material and compiled-state is over-engineering — this bead doesn't ship.

If overlap ≥40%, the compiled-state sub-agent caches the work that would otherwise be redone. Target: ≥30% reduction in cumulative LLM cost across N-turn threads vs stateless retrieval.

# What

- Sub-agent process per silvercode session (or shared per project)
- Anthropic prompt cache (~50K tokens of compiled context)
- ACP-event-driven update loop: each new turn → delta query (only NEW salient tokens) → update internal state
- Hook reads compiled-state's current view, not the FTS index directly
- Visibility UI: silvercode side panel shows what the sub-agent is currently \"thinking about\"

# Depends on

- @km/tribe/recall-eval-corpus (must measure Q2 overlap before this is justified)
- @km/tribe/recall-salience-trigger (compiled-state's delta-update needs salience-diff signal anyway)

# Status

Deferred. The eval corpus must show this earns its complexity. If it doesn't, this bead closes as superseded by salience-trigger + drop-synthesis (which together may be 80% of the value at 5% of the engineering).
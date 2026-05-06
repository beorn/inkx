---
mentions:
  - km
id: "@km/tribe/recall-drop-synthesis"
aliases:
  - km-tribe.recall-drop-synthesis
  - km-tribe-recall-drop-synthesis
created_by: claude:4de4a3ab
created_at: 2026-04-28T06:33:44Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-drop-synthesis
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T23:33:45Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-drop-synthesis
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-27T23:33:45Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tribe
      - type: link
        target: km-tribe.recall-eval-corpus
---

# [ ] Drop synthesis from ambient injection path @km/tribe #task #P3

blocks:: [[@km/tribe]], [[@km/tribe/recall-eval-corpus]]

## Why

/pro architectural review (recall-pro-review-architecture-1.md, 2026-04-27) locked in three overrides for the ambient path:

1. **Drop synthesis from ambient path** ← this bead
2. Outcome-aware ranking is highest-impact
3. Async breaks causality — go sub-second sync

Synthesis adds ~\$0.005 per probe call and 2-3s latency. For ambient injection (where the agent will read the snippet anyway), the LLM-rewritten paragraph is redundant. Show ranked snippets only; let the consuming agent synthesize on demand.

## What

\`recall --agent --max-rounds 1 --no-synthesis --json\` flag (or default-off for ambient mode). The probe + hook stop emitting the \"Synthesis: ...\" line. Top-K snippets only.

The \`tribe.ask\` MCP tool (Tier 1, on-demand) keeps synthesis — that's where the agent explicitly asks \"what do you know about X\" and a paragraph answer is the right shape.

## Acceptance gate

@km/tribe/recall-eval-corpus must show that recall@5 doesn't regress when synthesis is off. If snippets-only loses information that matters for the agent's next action, this bead doesn't ship.

## Depends on

@km/tribe/recall-eval-corpus (must measure synthesis-on vs synthesis-off baseline)


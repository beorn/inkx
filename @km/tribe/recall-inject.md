---
mentions:
  - km
id: "@km/tribe/recall-inject"
aliases:
  - km-tribe.recall-inject
  - km-tribe-recall-inject
created_by: claude:4de4a3ab
created_at: 2026-04-27T23:11:05Z
closed_at: 2026-04-28T20:30:29Z
close_reason: V2 5-stage gate shipped. bearly 7750f39 + km 67f606d69. Remaining
  V2 work (compiled-state, outcome-aware bd lookup) captured in notes; reopen if
  measured useful-rate stays below target after dogfooding 30+ prompts.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-inject
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-27T16:11:05Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe.recall
---

# [x] Mem inject (Tier 2): rebuild UserPromptSubmit recall hook with dedupe + skip-on-no-salience + outcome-aware ranking @km/tribe #feature #P3

blocks:: [[@km/tribe/recall]]

## Tier 2 — mem inject (rebuild)

The current UserPromptSubmit hook fires hookRecall on every non-trivial prompt and injects a synthesized <recall-memory> blob. Documented problems:

- Redundant — same docs re-appear across turns
- Cache-hostile — content varies per turn, invalidates Anthropic prompt cache
- Single-FTS only — agent-mode planner-fanout was too slow
- All-or-nothing — no granularity to skip uninteresting turns

## Rebuild approach

- Per-(token, scope) dedupe with TTL — never re-inject same chunk in one session
- Skip-on-no-salience — if prompt has no recallable identifier, inject nothing (most turns). Bounds cache invalidation.
- No LLM in hook path — raw chunks with status headers, sub-300ms
- Outcome-aware ranking — RESOLVED / SUPERSEDED / REJECTED / EXPLORATORY status labels

## Defer reasoning

Bigger surface than other tiers — touches hook framework, dedupe state, cache mechanics. Land after Tier 3 (recall-thought) is dogfooded; we'll know what mem-inject should add on top of mem-thought.


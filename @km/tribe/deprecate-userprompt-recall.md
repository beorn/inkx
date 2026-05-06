---
mentions:
  - km
id: "@km/tribe/deprecate-userprompt-recall"
aliases:
  - km-tribe.deprecate-userprompt-recall
  - km-tribe-deprecate-userprompt-recall
created_by: claude:87d20187
created_at: 2026-04-27T14:52:15Z
owner: bjorn@stabell.org
---

# [ ] Deprecate UserPromptSubmit auto-recall once bg-recall A/B comparison settles @km/tribe #task #P3

## Why

bg-recall (@km/tribe/bg-recall-daemon, shipped 2026-04-27) replaces the always-on UserPromptSubmit auto-recall with a non-blocking, evolving-context-aware flow. Per the bg-recall bead description: 'Replaces (eventually): the always-on UserPromptSubmit auto-recall path. Migration: ship daemon first, run alongside, A/B compare hint quality vs auto-recall noise, then deprecate auto-recall.'

bg-recall and auto-recall currently coexist as dual-paths. This violates 'no backward-compat shims' per docs/lessons/refactoring.md. The plateau-blocker is the dual-path itself.

## What

After 2-4 weeks of A/B observation:

1. Compare bg-recall hint adoption rate vs UserPromptSubmit auto-recall noise
2. If bg-recall wins: remove the UserPromptSubmit hook config that calls into recall.ts, delete the auto-recall codepath in vendor/bearly/plugins/recall/src/history/scanner.ts, update vendor/bearly/tools/lib/hooks/listeners/tribe.ts to drop the auto-recall handler
3. If bg-recall doesn't win: tune relevance thresholds + entity extraction; re-evaluate

## Acceptance

- grep -rn 'UserPromptSubmit.*recall\|auto.*recall\|always.*on.*recall' vendor/bearly/ vendor/accountly/ → 0 hits in production code (test-only references OK)
- vendor/bearly/plugins/recall/src/history/scanner.ts no longer recommends UserPromptSubmit hook config
- vendor/bearly/tools/lib/hooks/listeners/tribe.ts no longer routes UserPromptSubmit to recall.ts

## When

After bg-recall has been live 14+ days with measurable hit-rate metrics. Use 'bun bg-recall status' to check adoption rate; if >25% adoption rate sustained, proceed.

## Reference

- bg-recall README: vendor/bearly/packages/bg-recall/README.md (the 'Replaces (eventually)' note)
- bg-recall bead: @km/tribe/bg-recall-daemon (closed)
- Parent epic: @km/tribe/refactor (closed)


---
mentions:
  - km
  - claude
id: "@km/all/fix-sweep-tsc-kmtui"
aliases:
  - km-all.fix-sweep-tsc-kmtui
  - km-all-fix-sweep-tsc-kmtui
created_by: claude:cc081a9a
created_at: 2026-04-26T19:59:04Z
closed_at: 2026-04-26T20:04:04Z
close_reason: Closed
started_at: 2026-04-26T20:00:00Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-tsc-kmtui
    depends_on_id: km-all.fix-sweep-0426
    type: parent-child
    created_at: 2026-04-26T12:59:13Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-0426
---

# [x] Fix km-tui test typecheck errors (94 errors) @km/all #task #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

94 TS errors in apps/@km/tui/tests/* — three sub-clusters:

## Sub-cluster 1: dimColor → dim (Text prop)

silvery removed dimColor; canonical prop is dim. Files:

- apps/@km/tui/tests/storybook.tsx (~50 errors)
- apps/@km/tui/tests/repro-status-bar.test.tsx (~7 errors)

## Sub-cluster 2: term.screen / term.cell optional

- apps/@km/tui/tests/card-bg-inheritance.test.ts (~5 errors)

## Sub-cluster 3: misc API drift in @km/tui tests

Various tests with type narrowing / signature drift.

## Acceptance

- bun run --silent tsc --noEmit 2>&1 | grep -c 'apps/@km/tui/' returns 0
- Underlying tests still pass (or fail for unrelated reasons)


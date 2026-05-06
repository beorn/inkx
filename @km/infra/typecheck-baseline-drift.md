---
mentions:
  - km
id: "@km/infra/typecheck-baseline-drift"
aliases:
  - "@km/all/typecheck-baseline-drift"
  - km-all.typecheck-baseline-drift
  - km-all-typecheck-baseline-drift
created_by: claude:cc081a9a
created_at: 2026-04-28T15:07:47Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.typecheck-baseline-drift
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-28T08:07:47Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] 8 new typecheck errors after Phase 3 merges (silvercode tests, silvery test, storybook) @km/all #bug #P2

blocks:: [[@km/all]]

Phase 3 merges introduced 8 new TS errors beyond baseline. Files:

- apps/silvercode/packages/claude-acp/tests/wire-write-ordering.test.ts (1)
- apps/silvercode/storybook/stories/All.story.tsx (1)
- vendor/silvery/packages/create/tests/with-app-apply-chain.test.ts (1)
- vendor/silvery/tests/features/excess-clear-gate.test.tsx (5)

Mostly type-shape drift in tests where types evolved on main but tests on the merged branches were written against older types. Run 'bun run typecheck' to see; 'bun run typecheck:update' to baseline if intentional. Not runtime-blocking — test output succeeds at runtime, just type-shape strict.


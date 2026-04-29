---
id: "@km/tui/tree/p1-fix"
aliases:
  - km-tui.tree.p1-fix
  - km-tui-tree-p1-fix
created_by: Bjørn Stabell
created_at: 2026-04-08T23:58:28Z
closed_at: 2026-04-09T00:18:34Z
close_reason: "rebind() was clearing cached nodes, orphaning signal
  subscriptions. Fix: update traversal in-place. 62 test failures fixed, stale
  bench deleted. Commit 86ff72cfb."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 1: Fix test failures + stale import from Phase 3 store merge @km/tui #task #P1 @Bjørn Stabell

## What

Fix the 62 test failures introduced by v3 Phase 3 (store merge, NodeReactiveState deletion) and the stale bench import.

## Changes

- `apps/km-tui/tests/computed-vs-engine.bench.ts` — delete stale import of reduced-signals.ts (file was deleted in v3 Phase 2)
- `apps/km-tui/tests/board-view.spec.ts` — adapt fold tests to new signal format (5 failures)
- `apps/km-tui/tests/text-cursor-bugs.spec.ts` — adapt edit signal reads (7 failures)
- `apps/km-tui/tests/edit-save-repro.test.ts` — adapt edit signal reads (4 failures)
- `apps/km-tui/tests/input-mode.test.ts` — adapt fold test (1 failure)
- `apps/km-tui/tests/card-layout.test.tsx` — adapt fold body indicator test (1 failure)
- `apps/km-tui/tests/mouse-click.test.ts` — adapt edit mode navigation (1 failure)
- Position/location tests — adapt signal format (~43 failures)

## Delete

Nothing — this is a fix phase.

## /complete

```bash
bun tsc --noEmit  # 0 errors
bun run test:fast  # all pass
rg 'reduced-signals' apps/km-tui/tests/ -c  # 0 hits
```
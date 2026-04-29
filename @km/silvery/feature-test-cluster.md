---
id: "@km/silvery/feature-test-cluster"
aliases:
  - km-silvery.feature-test-cluster
  - km-silvery-feature-test-cluster
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:27Z
closed_at: 2026-04-27T00:04:56Z
close_reason: "Fixed via two changes in silvery (commit 80570650): (1) AIChat
  run() opts + test setup pass handleTabCycling: false so Tab reaches
  useKeyBindings.fillOrSubmit instead of being consumed by focus tab-cycling —
  fixes inline-scrollback-promotion 'frozen content enters terminal scrollback'.
  (2) box-in-text-warning.test.tsx updated to handle loggily's
  console.warn(prefix, message, ...args) signature using mock.calls.some().
  pipeline-bugfixes.test.tsx and text-frame.test.ts already passed on main. km
  bumped via commit ab0da0352 on branch fix/silvery-feature-test-cluster."
---

# [x] [bug] vendor/silvery feature tests — 5 failures (4 files) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

pipeline-bugfixes.test.tsx (2: lines 554, 580), box-in-text-warning.test.tsx (1), text-frame.test.tsx (1: line 94), inline-scrollback-promotion.test.tsx (1: line 193). /complete: bun vitest run --project vendor vendor/silvery/tests/features/pipeline-bugfixes.test.tsx vendor/silvery/tests/features/box-in-text-warning.test.tsx vendor/silvery/tests/features/text-frame.test.tsx vendor/silvery/tests/features/inline-scrollback-promotion.test.tsx → 0 failures.
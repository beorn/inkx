---
id: "@km/silvery/scope-test-failures"
aliases:
  - km-silvery.scope-test-failures
  - km-silvery-scope-test-failures
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:21Z
closed_at: 2026-04-26T23:39:52Z
close_reason: scope.test.ts rewritten for AsyncDisposableStack API. silvery
  f8508a05 / km 6ed4c2b00. All 16 tests pass.
started_at: 2026-04-26T23:23:37Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.scope-test-failures
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:29Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] vendor/silvery scope.test.ts — 15 failures (likely shared root cause) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

All 15 tests in vendor/silvery/tests/features/scope.test.ts fail. /complete: bun vitest run --project vendor vendor/silvery/tests/features/scope.test.ts → 0 failures.
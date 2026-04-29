---
id: "@km/silvery/test-theme-change"
aliases:
  - km-silvery.test-theme-change
  - km-silvery-test-theme-change
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:13Z
closed_at: 2026-03-13T05:31:15Z
close_reason: Added theme change regression tests in
  vendor/silvery/tests/theme-change.test.tsx — 5 tests covering bgDirty marking,
  subtree token inheritance, theme cascading through clean parents, nested Box
  bg/fg updates, and incremental vs fresh render equivalence.
---

# [x] Testing: Theme change regression tests needed @km/silvery #task #P2

commitUpdate marks bgDirty on theme change — need dedicated tests for: theme token changes, subtree token inheritance, theme changes with skipped parents.
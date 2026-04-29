---
id: "@km/silvery/test-suspense-hide"
aliases:
  - km-silvery.test-suspense-hide
  - km-silvery-test-suspense-hide
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:14Z
closed_at: 2026-03-13T05:31:17Z
close_reason: Added hideInstance/unhideInstance render path tests in
  vendor/silvery/tests/hide-unhide.test.tsx — 6 tests covering Suspense fallback
  rendering, unhide content restoration, stale pixel prevention, display=none
  toggle, display=none pixel leak check, and hidden backgroundColor cleanup.
---

# [x] Testing: hideInstance/unhideInstance render path untested @km/silvery #task #P2

host-config supports hideInstance/unhideInstance/hideTextInstance/unhideTextInstance but no serious render-path tests for hidden subtree cleanup/restore. Likely source of stale pixels.
---
mentions:
  - km
  - claude
id: "@km/silvery/verify-output-shrink"
aliases:
  - km-silvery.verify-output-shrink
  - km-silvery-verify-output-shrink
created_by: claude:c9beade3
created_at: 2026-03-13T05:01:13Z
closed_at: 2026-03-13T05:16:49Z
close_reason: "Fixed: verifyOutputEquivalence() comparison loop now uses
  vtHeight instead of compareHeight, catching stale rows after height shrink."
owner: bjorn@stabell.org
assignee: claude:65d845d9
---

# [x] Bug: verifyOutputEquivalence() misses stale rows after height shrink @km/silvery #bug #P0 @claude:65d845d9

In output-phase.ts, verifyOutputEquivalence() sets compareHeight = next.height and only compares y < compareHeight. Stale terminal content lingering below next.height after a shrink goes undetected. Fix: compare all vtHeight rows, treating rows outside next as blank/default.


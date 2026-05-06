---
mentions:
  - km
  - claude
id: "@km/silvery/bundle-audit"
aliases:
  - km-silvery.bundle-audit
  - km-silvery-bundle-audit
created_by: claude:474834b0
created_at: 2026-03-09T21:49:52Z
closed_at: 2026-03-10T01:27:12Z
close_reason: "Measured all silvery entry points vs Ink. Core is 1.9x smaller
  (181KB vs 348KB gzip). Tree-shaking works: Ink bundles 336-352KB regardless of
  imports. Full results in tests/tree-shaking/RESULTS.md."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Bundle size measurement + comparison with Ink @km/silvery #task #P3 @claude:474834b0

Measure silvery bundle size per entry point. Compare against Ink to validate the 'smaller/faster' claim.


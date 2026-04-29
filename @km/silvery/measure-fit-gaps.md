---
id: "@km/silvery/measure-fit-gaps"
aliases:
  - km-silvery.measure-fit-gaps
  - km-silvery-measure-fit-gaps
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:10Z
closed_at: 2026-03-13T05:16:58Z
close_reason: Gap part fixed. internal_transform and flex-wrap are separate,
  more complex issues — tracked as future work.
---

# [x] Bug: measureIntrinsicSize() ignores gap, internal_transform, flex-wrap @km/silvery #bug #P1 @claude:65d845d9

In measure-phase.ts, fit-content measurement doesn't account for gap property, internal_transform effects, or width-constrained height wrapping. Current implementation is a simplified intrinsic-size guess.
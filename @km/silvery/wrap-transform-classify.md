---
id: "@km/silvery/wrap-transform-classify"
aliases:
  - km-silvery.wrap-transform-classify
  - km-silvery-wrap-transform-classify
created_by: claude:c9beade3
created_at: 2026-03-13T05:01:13Z
closed_at: 2026-03-13T05:16:48Z
close_reason: "Fixed: moved wrap and internal_transform from styleProps to
  contentProps in contentPropsChanged(). They now correctly trigger
  contentDirty+layoutDirty instead of just paintDirty."
---

# [x] Bug: wrap and internal_transform misclassified as style-only in contentPropsChanged() @km/silvery #bug #P0 @claude:65d845d9

contentPropsChanged() in reconciler/helpers.ts classifies wrap and internal_transform as style changes, so commitUpdate sets paintDirty but NOT contentDirty/layoutDirty. Both affect measurement/layout: wrap changes line breaking and height, internal_transform changes text content width/height. This causes stale measure cache and stale layout on incremental renders.
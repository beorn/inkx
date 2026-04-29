---
id: "@km/inkx/outline"
aliases:
  - km-inkx.outline
  - km-inkx-outline
created_by: claude:97217d5d
created_at: 2026-02-16T22:19:00Z
closed_at: 2026-02-23T00:29:00Z
---

# [x] Outline prop: visual border that doesn't affect layout dimensions @km/inkx #feature #P4 @claude:ee8efc0f

CSS outline equivalent for inkx. An outline renders border characters at the box edges but does not contribute to Yoga/Flexx layout dimensions. This would enable selection indicators that don't shift content. Use case: body block cards that show a visible border when selected without changing their bounding box size.
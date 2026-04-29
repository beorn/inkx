---
id: "@km/silvery/dup-layout-propagation"
aliases:
  - km-silvery.dup-layout-propagation
  - km-silvery-dup-layout-propagation
created_by: claude:c9beade3
created_at: 2026-03-13T04:36:07Z
closed_at: 2026-03-13T05:18:36Z
close_reason: "Won't fix: Only affects Ink compat layer (calculateLayout in
  nodes.ts), not the pipeline. The pipeline's propagateLayout in layout-phase.ts
  is authoritative and correct. Ink compat is deprecated."
owner: bjorn@stabell.org
---

# [x] Duplicate layout propagation in reconciler/nodes.ts — dead/dangerous code @km/silvery #bug #P3

packages/react/src/reconciler/nodes.ts contains its own calculateLayout/propagateLayout/notifyLayoutSubscribers that duplicate pipeline/layout-phase.ts. These don't set layoutChangedThisFrame. If used anywhere, docs are wrong. If unused, they're dangerous dead code that will confuse contributors. Delete or unify. Found by GPT 5.4 pro.
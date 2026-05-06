---
mentions:
  - km
  - claude
id: "@km/inkx/suspense-embed"
aliases:
  - km-inkx.suspense-embed
  - km-inkx-suspense-embed
created_by: claude:a3625ec3
created_at: 2026-02-09T14:43:52Z
closed_at: 2026-02-11T17:56:55Z
owner: bjorn@stabell.org
assignee: claude:2f3fc9d8
---

# [x] Suspense staggered loading corrupts incremental renderer when embedded @km/inkx #bug #P3 @claude:2f3fc9d8

When a component with multiple Suspense boundaries (staggered async loading) is rendered inside another app, the incremental renderer gets corrupted: sidebar disappears, frames bleed through, borders overlap. The staggered resolution of Suspense promises causes multiple partial re-renders that conflict with the parent's render cycle. Repro: render AsyncDataApp inside the viewer's Preview component.


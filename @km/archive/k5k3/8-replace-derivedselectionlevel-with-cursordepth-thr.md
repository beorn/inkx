---
mentions:
  - km
id: "@km/k5k3/8-replace-derivedselectionlevel-with-cursordepth-thr"
aliases:
  - km-k5k3.8
  - km-k5k3-8
  - "@km/k5k3/8"
created_at: 2026-01-21T10:49:43Z
closed_at: 2026-01-21T15:43:45Z
---

# [x] Replace derivedSelectionLevel with cursorDepth throughout @km/k5k3 #task #P2

After selectionLevel removal is complete, replace all derivedSelectionLevel usages with direct cursorDepth checks. No fallback/compatibility code should remain.


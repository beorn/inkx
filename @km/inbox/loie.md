---
mentions:
  - km
id: "@km/inbox/loie"
aliases:
  - km-loie
  - "@km/_orphan/loie"
created_at: 2026-01-20T13:48:40Z
closed_at: 2026-01-20T13:48:47Z
---

# [x] Add computeIntrinsicMainSize for container sizing @km/_orphan #task #P1

Flexx layout engine was not computing intrinsic sizes for containers with auto-sized main axis. This caused column layouts to have height=0 when the container had no explicit height.

Root cause: When computing baseSize for flex children, the code only handled leaf nodes with measureFunc. Containers (nodes with children but no measureFunc) fell through to baseSize=0.

Solution: Added computeIntrinsicMainSize() helper that recursively computes intrinsic main-axis size for containers by summing children's sizes + gaps + padding + border.

This is fundamental to proper flex layout - containers must size-to-content when no explicit size is given.


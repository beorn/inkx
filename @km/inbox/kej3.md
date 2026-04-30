---
id: "@km/inbox/kej3"
aliases:
  - km-kej3
  - "@km/_orphan/kej3"
created_at: 2026-01-21T13:40:42Z
closed_at: 2026-01-21T15:19:41Z
---

# [x] Fix TUI hang on large repos with lazy loading @km/_orphan #task #P1

When filesystem changes trigger a refresh, the TUI hangs with large vaults (5000+ files). Root cause: buildTreeNodes() loads entire tree recursively. Solution: Add childrenLoaded flag to TNode, use childCount for bounds, shallow load on refresh.
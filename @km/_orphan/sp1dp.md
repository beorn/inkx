---
id: "@km/_orphan/sp1dp"
aliases:
  - km-sp1dp
created_at: 2026-02-03T14:27:20Z
closed_at: 2026-02-03T14:28:25Z
---

# [x] inkx: stale pixels when children conditionally removed @km/_orphan #bug #P2 @claude:3c00d7cc

content-phase.ts line 118 clear condition only checks contentDirty/paintDirty/layoutChanged but not subtreeDirty. When React removes children conditionally, parent only has subtreeDirty set, so region is not cleared. Stale pixels from removed children persist in cloned buffer. Fix: add node.subtreeDirty to the clear condition.
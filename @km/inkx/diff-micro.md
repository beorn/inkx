---
id: "@km/inkx/diff-micro"
aliases:
  - km-inkx.diff-micro
  - km-inkx-diff-micro
created_by: claude:c7c59180
created_at: 2026-02-10T15:37:27Z
closed_at: 2026-02-10T15:46:32Z
---

# [x] perf(inkx): diff micro-optimizations (bounding box, relative cursor, row slice compare) @km/inkx #task #P3 @claude:c7c59180

Three micro-optimizations for the output phase diff path:

1. **Dirty row bounding box**: Track minDirtyRow/maxDirtyRow during content phase so diffBuffers() loops [min,max] instead of [0,height). Saves dirty-flag checks for clean regions above/below.

2. **Relative cursor moves**: Use ESC[C/ESC[B for small cursor jumps (1-3 cells) instead of absolute ESC[y;xH (saves 2-5 bytes per move).

3. **Row-level metadata slice compare**: Before per-cell cellEquals(), compare the row's packed Uint32Array metadata as a slice. If all 32-bit values match, only need to check chars array. Avoids per-cell function call overhead for unchanged rows that are marked dirty (e.g., due to fill()).
---
id: "@km/inkx/alloc-hotpath"
aliases:
  - km-inkx.alloc-hotpath
  - km-inkx-alloc-hotpath
created_at: 2026-02-05T12:50:38Z
closed_at: 2026-02-05T12:56:01Z
---

# [x] perf(inkx): Quick allocation fixes (getBorderChars, bgConflictMode, styleToAnsi) @km/inkx #task #P3 @claude:b53ef7e4

P6: Hoist getBorderChars to module scope. P9: Cache getBgConflictMode. M5: Use parseColor directly in styleToAnsi.
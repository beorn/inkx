---
id: "@km/inkx/incr-rapid"
aliases:
  - km-inkx.incr-rapid
  - km-inkx-incr-rapid
created_by: claude:499eee95
created_at: 2026-02-13T18:27:47Z
closed_at: 2026-02-13T18:45:27Z
---

# [x] INKX incremental mismatch on rapid keypresses @km/inkx #bug #P2

production-entry.spec.ts fails at lines 742 and 782:
INKX_CHECK_INCREMENTAL (createApp): MISMATCH at (79, 20) on render #7 and #9.

Occurs during rapid keypress tests (10x j, 50 moves). The incremental renderer produces different output than a full re-render at position (79, 20). This is a rendering correctness bug in the inkx incremental pipeline.
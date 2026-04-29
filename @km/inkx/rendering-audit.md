---
id: "@km/inkx/rendering-audit"
aliases:
  - km-inkx.rendering-audit
  - km-inkx-rendering-audit
created_by: claude:23485adf
created_at: 2026-02-24T21:58:29Z
closed_at: 2026-02-25T12:33:54Z
---

# [x] Rendering audit: garble, content-phase perf, zoom crash @km/inkx #task #P1 @claude:23485adf

Three active issues from Asana vault testing:

1. **Rendering garble**: Board view shows garbled text, overlapping content, misaligned columns after navigation. INKX_STRICT doesn't catch it (suggests output-phase or terminal state issue). Screenshots on Desktop (2026-02-24).

2. **Content phase 250ms**: Every cursor_right takes ~250ms in content phase alone. skipFastPath=false means ALL nodes render every frame. Need to either re-enable fast path or find other optimizations. Target: <33ms (frame budget).

3. **Zoom crash**: Zoom out then zoom in causes a crash. Needs reproduction and fix.

4. **Duplicate card content**: Screenshot shows card content rendered 3x (same Morning routine block appears three times).
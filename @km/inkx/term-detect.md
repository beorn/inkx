---
id: "@km/inkx/term-detect"
aliases:
  - km-inkx.term-detect
  - km-inkx-term-detect
created_by: claude:ee8efc0f
created_at: 2026-02-23T01:21:54Z
closed_at: 2026-02-23T01:47:51Z
---

# [x] Terminal capability detection @km/inkx #feature #P2 @claude:ee8efc0f

Auto-detect terminal features at startup by inspecting TERM, TERM_PROGRAM, COLORTERM env vars and querying terminfo. Store capability flags like supportsTrueColor, supportsKittyGraphics, supportsSixel, supportsOSC52 (clipboard), etc. Enables graceful degradation — apps can check capabilities and fall back to simpler rendering on limited terminals.
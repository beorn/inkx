---
id: "@km/inkx/inline-autowrap"
aliases:
  - km-inkx.inline-autowrap
  - km-inkx-inline-autowrap
created_by: claude:d1f60fb4
created_at: 2026-02-25T15:14:27Z
closed_at: 2026-02-25T15:36:42Z
---

# [x] Inline mode: DECAWM auto-wrap causes visual overflow on full-width lines @km/inkx #bug #P1 @claude:d1f60fb4

When bufferToAnsi writes exactly N chars to an N-col line, the cursor enters pending-wrap state. The subsequent newline causes double line advance, creating blank lines and visual overflow. Root cause: output-phase.ts inner loop writes 0..width-1 (80 chars on 80-col terminal). Fix: limit inline mode output to cols-1, or trim trailing whitespace before last column. Standard practice in vim/less.
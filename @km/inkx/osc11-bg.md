---
id: "@km/inkx/osc11-bg"
aliases:
  - km-inkx.osc11-bg
  - km-inkx-osc11-bg
created_by: claude:d697f216
created_at: 2026-02-25T13:21:47Z
closed_at: 2026-03-04T16:23:43Z
---

# [x] OSC 11: detect terminal background color for auto dark/light theme @km/inkx #feature #P2

Add async OSC 11 query to detect terminal background color. Query: \x1b]11;?\x1b\\ → response: \x1b]11;rgb:rrrr/gggg/bbbb\x1b\\. Use luminance threshold to determine dark/light. Add to TerminalCaps. Enables auto-theme detection. Also implement OSC 10 (foreground) and OSC 12 (cursor color) as part of the same query batch.
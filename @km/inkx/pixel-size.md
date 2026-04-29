---
id: "@km/inkx/pixel-size"
aliases:
  - km-inkx.pixel-size
  - km-inkx-pixel-size
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:27:34Z
closed_at: 2026-02-25T23:37:06Z
owner: bjorn@stabell.org
---

# [x] CSI 14t/18t — terminal size in pixels and chars @km/inkx #feature #P4

Query terminal dimensions:
- CSI 14t: text area size in pixels (response: CSI 4 ; height ; width t)
- CSI 18t: text area size in chars (response: CSI 8 ; rows ; cols t)

Useful for precise image rendering (Kitty graphics, Sixel) where cell pixel dimensions matter.
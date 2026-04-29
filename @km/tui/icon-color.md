---
id: "@km/tui/icon-color"
aliases:
  - km-tui.icon-color
  - km-tui-icon-color
created_by: claude:124bfbe5
created_at: 2026-02-12T22:54:27Z
closed_at: 2026-02-12T22:54:53Z
---

# [x] File icon darker (gray) than folder icon (white) @km/tui #bug #P3

In nerdfont icon style, file icon uses color='gray' while folder icon uses color='white'. User expects them to have similar visibility. Located in icons.ts:149-151.
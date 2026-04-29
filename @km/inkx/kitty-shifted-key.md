---
id: "@km/inkx/kitty-shifted-key"
aliases:
  - km-inkx.kitty-shifted-key
  - km-inkx-kitty-shifted-key
created_by: claude:d3a7049b
created_at: 2026-02-20T14:04:37Z
closed_at: 2026-02-20T14:09:46Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Expose shifted key and base layout key from Kitty sequences @km/inkx #task #P3 @claude:d3a7049b

Kitty format is CSI codepoint:shifted_codepoint:base_layout_key;modifiers u. The shifted_codepoint is captured by our regex (group 2) but not exposed. The base_layout_key (for non-Latin keyboard layouts) isn't parsed at all. Should surface both on ParsedKeypress.
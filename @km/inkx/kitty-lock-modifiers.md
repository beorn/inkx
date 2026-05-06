---
mentions:
  - km
  - claude
id: "@km/inkx/kitty-lock-modifiers"
aliases:
  - km-inkx.kitty-lock-modifiers
  - km-inkx-kitty-lock-modifiers
created_by: claude:d3a7049b
created_at: 2026-02-20T14:04:49Z
closed_at: 2026-02-20T14:09:46Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Parse CapsLock/NumLock modifiers from Kitty sequences @km/inkx #task #P4 @claude:d3a7049b

Kitty modifier bits 6 (CapsLock=64) and 7 (NumLock=128) are not parsed. Low priority — rarely needed for TUI apps.


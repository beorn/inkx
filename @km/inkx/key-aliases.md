---
id: "@km/inkx/key-aliases"
aliases:
  - km-inkx.key-aliases
  - km-inkx-key-aliases
created_at: 2026-02-05T16:00:25Z
closed_at: 2026-02-05T16:05:20Z
assignee: claude:49c1df8a
---

# [x] keyToAnsi: accept ctrl/shift/alt as aliases for Control/Shift/Alt @km/inkx #task #P3 @claude:49c1df8a

keyToAnsi() only accepts Playwright-style modifier names (Control+a, Shift+Tab). Common lowercase aliases (ctrl+a, shift+tab, alt+x) silently fall through and type literal characters instead. Should normalize modifiers case-insensitively so both styles work.
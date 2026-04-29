---
id: "@km/tui/keybar"
aliases:
  - km-tui.keybar
  - km-tui-keybar
created_by: claude:536645b5
created_at: 2026-02-20T15:47:56Z
closed_at: 2026-02-20T16:06:30Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Contextual key bar: mode-aware bottom bar showing available keys @km/tui #feature #P3 @claude:d3a7049b

Mode-aware bottom bar showing available keys for current context. Updates on mode switch (node/text), pane focus, chord state. Shows 'g: goto  m: move  a: add' in node mode, 'Esc: exit  Ctrl+s: save' in text mode, etc. See docs/keybindings-v2.md §Key Bar.
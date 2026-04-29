---
id: "@km/tui/q-close"
aliases:
  - km-tui.q-close
  - km-tui-q-close
created_at: 2026-02-05T12:15:02Z
closed_at: 2026-02-05T12:19:11Z
---

# [x] feat(tui): 'q' closes dialog boxes @km/tui #feature #P3 @claude:3d543eef

Pressing 'q' should close dialog boxes (Console, Help, etc). For dialogs with text input (Search), 'q' types into the input field — only Esc closes those. The input layer stack handles priority: search field > dialog > board > app.
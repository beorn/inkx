---
mentions:
  - km
  - claude
id: "@km/inbox/qaco9"
aliases:
  - km-qaco9
  - "@km/_orphan/qaco9"
created_by: claude:5770ce77
created_at: 2026-02-17T13:50:33Z
closed_at: 2026-02-17T23:21:33Z
owner: bjorn@stabell.org
assignee: claude:5770ce77
---

# [x] TUI: td dialog Return/Escape goes to background editor instead of dialog input @km/_orphan #bug #P1 @claude:5770ce77

When td dialog is open with a text input field, Return and Escape keystrokes are routed to the background block editor instead of the dialog's text input. This is an input layering issue — the dialog's input layer should capture these keys before they reach the board/editor.


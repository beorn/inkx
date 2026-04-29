---
id: "@km/tui/embed-display"
aliases:
  - km-tui.embed-display
  - km-tui-embed-display
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:30:13Z
closed_at: 2026-02-15T14:16:49Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Embedded links from km add show as \!link, ctrl-enter fails @km/tui #bug #P1 @claude:a5c7f7de

After km add creates embed links, TUI shows raw \![[target]] syntax instead of resolved content. Ctrl-enter says 'not an embed'. Root cause: km add creates node with type:li+link_to, serializes as \![[target]], but file watcher re-parse creates type:link node with link_to:null. Link resolution may not re-run.
---
id: "@km/tui/undo-cursor-restore"
aliases:
  - km-tui.undo-cursor-restore
  - km-tui-undo-cursor-restore
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:44:23Z
closed_at: 2026-02-14T22:50:26Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Undo after duplicate moves cursor to root instead of preserving position @km/tui #bug #P2 @claude:a5c7f7de

After duplicating a card and then pressing undo, the cursor jumps to the root node instead of staying at the original position. Should check how SlateJS handles cursor restoration in undo — the cursor position before the operation should be restored.
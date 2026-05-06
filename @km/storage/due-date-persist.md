---
mentions:
  - km
  - claude
id: "@km/storage/due-date-persist"
aliases:
  - km-storage.due-date-persist
  - km-storage-due-date-persist
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:08:44Z
closed_at: 2026-02-14T23:15:36Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Due date not persisted — lost on quit/reload, not shown in detail view @km/storage #bug #P1 @claude:a5c7f7de

When a user adds a due_date to a card/item:

1. The due date doesn't appear in the detail view
2. After quitting and reloading, the due date is gone entirely

This is likely a markdown round-trip issue — the due_date property isn't being serialized to the markdown file, or isn't being parsed back on reload.

**Steps to investigate:**

1. Check how due_date is set in the TUI (board-actions-edit.ts or similar)
2. Check if due_date makes it into the node's properties
3. Check if nodes2md.ts serializes due_date to markdown frontmatter/properties
4. Check if ast2nodes.ts parses due_date back from markdown
5. Check if the detail view reads and displays due_date


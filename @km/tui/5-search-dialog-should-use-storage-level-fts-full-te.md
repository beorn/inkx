---
mentions:
  - km
  - claude
id: "@km/tui/5-search-dialog-should-use-storage-level-fts-full-te"
aliases:
  - km-tui.5
  - km-tui-5
  - "@km/tui/5"
created_at: 2026-02-06T11:11:10Z
closed_at: 2026-02-12T20:01:09Z
assignee: claude:124bfbe5
---

# [x] Search dialog should use storage-level FTS (full-text-search) @km/tui #task #P3 @claude:124bfbe5

The search dialog currently does its own text matching. It should use the storage-level full-text-search (FTS5) system from @km/storage for better performance and query capabilities.


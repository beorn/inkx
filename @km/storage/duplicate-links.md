---
id: "@km/storage/duplicate-links"
aliases:
  - km-storage.duplicate-links
  - km-storage-duplicate-links
created_by: claude:ceb7c9cb
created_at: 2026-03-27T16:00:21Z
closed_at: 2026-03-27T21:54:20Z
close_reason: NULL-safe UNIQUE index with COALESCE + migration deduplicates 629 groups
---

# [x] Duplicate link rows in links table (629 groups) @km/storage #bug #P3 @claude:ceb7c9cb

sqlite3 links table has 629 groups of duplicate rows (same source_id, target_id, target_name). Causes inflated backlink counts in delete confirmation dialog. Root cause likely in link extraction during file parsing — same wikilink produces multiple INSERT rows.
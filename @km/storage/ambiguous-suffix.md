---
id: "@km/storage/ambiguous-suffix"
aliases:
  - km-storage.ambiguous-suffix
  - km-storage-ambiguous-suffix
created_by: claude:a5c7f7de
created_at: 2026-02-15T07:56:00Z
closed_at: 2026-02-15T08:50:04Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Ambiguous resolution for short ID suffixes (e.g. 'SSA' matches 2 nodes) @km/storage #bug #P3 @claude:a5c7f7de

When resolving node references by ID suffix (e.g. 'SSA'), the storage layer finds multiple matches and logs a warning. Need a disambiguation strategy — e.g. prefer most recently updated, or use longer suffixes.
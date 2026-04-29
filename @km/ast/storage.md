---
id: "@km/ast/storage"
aliases:
  - km-ast.storage
  - km-ast-storage
created_by: claude:124bfbe5
created_at: 2026-02-14T00:10:54Z
closed_at: 2026-02-14T00:59:41Z
owner: bjorn@stabell.org
---

# [x] Update storage schema and queries for km-ast types @km/ast #task #P1

Update packages/@km/storage/ for @km/ast schema.

Schema (schema.ts):
- Add columns: fstype TEXT, list_marker TEXT, task_marker TEXT
- Rename task_mark → remove (replaced by task_marker)
- Add index on fstype
- Update NODE_COLUMNS set

Store/DB (store.ts, db.ts):
- Update all INSERT/UPDATE statements for new columns
- Update query builders for new type values
- Update type checks: 'folder'/'file'/'section' → 'oi' + fstype
- Update 'task'/'ul'/'ol' → 'li'
- Update 'paragraph' → 'p', 'embed' → 'link'

Query layer:
- Update type:task queries → type:li + task_marker IS NOT NULL
- Update status queries to use task_marker
- Update type:folder/file/section → type:oi + fstype

~42 files in @km/storage need updates
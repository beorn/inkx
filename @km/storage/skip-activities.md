---
id: "@km/storage/skip-activities"
aliases:
  - km-storage.skip-activities
  - km-storage-skip-activities
created_by: claude:97b8de73
created_at: 2026-02-23T00:30:36Z
closed_at: 2026-02-23T12:38:33Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Don't import activities into DB - just adds clutter @km/storage #feature #P2 @claude:97b8de73

Activities/comments from Asana imports add significant clutter to the DB and rendering. Stop importing them entirely - they belong in Asana's UI, not in km.
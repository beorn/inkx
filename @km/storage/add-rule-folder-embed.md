---
id: "@km/storage/add-rule-folder-embed"
aliases:
  - km-storage.add-rule-folder-embed
  - km-storage-add-rule-folder-embed
created_by: claude:e7ea0892
created_at: 2026-02-11T18:44:07Z
closed_at: 2026-02-11T18:49:17Z
owner: bjorn@stabell.org
assignee: claude:e7ea0892
---

# [x] add= rule creates embed for folder node itself, causing nested Inbox > Inbox > Inbox @km/storage #bug #P2 @claude:e7ea0892

evaluateAddRule runs queryNodes(db, './inbox/**') which matches the inbox folder node. It then creates an \![[Inbox]] embed as a child of the ## Inbox section, giving triple nesting. Fix: filter out folder/file nodes from add= query results.
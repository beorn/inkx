---
id: "@km/inbox/sv85g"
aliases:
  - km-sv85g
  - "@km/_orphan/sv85g"
created_by: claude:e7c823b8
created_at: 2026-02-26T12:40:35Z
closed_at: 2026-02-26T12:48:26Z
owner: bjorn@stabell.org
assignee: claude:e7c823b8
---

# [x] Tags show empty names after Asana import @km/_orphan #bug #P2 @claude:e7c823b8

Tag reference nodes use content: '\![[^sourceId]]' which stripForDisplay() strips to empty string, showing '§ #' with no tag name
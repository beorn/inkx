---
mentions:
  - km
  - claude
id: "@km/tui/indent-types"
aliases:
  - km-tui.indent-types
  - km-tui-indent-types
created_by: claude:949598cc
created_at: 2026-02-12T09:52:13Z
closed_at: 2026-02-12T10:12:45Z
owner: bjorn@stabell.org
assignee: claude:949598cc
---

# [x] Indent/outdent type restrictions: only sections & list items @km/tui #feature #P3 @claude:949598cc

Indentation should only work for sections & list items (outline structure). Paragraphs can't be indented — operation should fail with bell. Also consider: embedded nodes in @next should be created as list items or ### sub-sections.


---
mentions:
  - km
id: "@km/inbox/2hxpk"
aliases:
  - km-2hxpk
  - "@km/_orphan/2hxpk"
created_by: claude:28b14b32
created_at: 2026-02-23T17:24:17Z
closed_at: 2026-02-23T17:37:20Z
owner: bjorn@stabell.org
---

# [x] Folded embeds show raw \![[ @km/_orphan #bug #P1

FoldedChildRow passes null for resolvedNode, so getDisplayContent can't resolve embed targets. Shows raw \![[^id]] instead of resolved title.


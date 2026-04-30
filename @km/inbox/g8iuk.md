---
id: "@km/inbox/g8iuk"
aliases:
  - km-g8iuk
  - "@km/_orphan/g8iuk"
created_by: claude:b92140a2
created_at: 2026-03-17T08:32:40Z
closed_at: 2026-03-17T15:04:30Z
close_reason: handleFolderIndexUpdate preserves existing body via isSlotNode() filtering.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P0: Index file body content silently discarded on rewrite @km/_orphan #bug #P0 @claude:b92140a2

handleFolderIndexUpdate() always passes empty string for body: generateIndexFileContent(title, '', ...). Any user-authored prose in the index file is erased by folder updates, child moves, or deletions. Fix: read existing index subtree, preserve non-slot body, patch only title+slots.
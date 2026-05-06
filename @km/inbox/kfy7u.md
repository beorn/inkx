---
mentions:
  - km
id: "@km/inbox/kfy7u"
aliases:
  - km-kfy7u
  - "@km/_orphan/kfy7u"
created_by: claude:e7c823b8
created_at: 2026-02-26T14:54:31Z
closed_at: 2026-02-26T15:04:08Z
owner: bjorn@stabell.org
---

# [x] Add padding after truncation ellipsis in TUI cards @km/_orphan #task #P3

Truncated text (ending in …) has no gap before card edge. Reserve 2 extra chars in inkx truncateText() so the ellipsis has visual breathing room.


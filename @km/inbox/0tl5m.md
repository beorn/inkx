---
mentions:
  - km
id: "@km/inbox/0tl5m"
aliases:
  - km-0tl5m
  - "@km/_orphan/0tl5m"
created_by: claude:65d845d9
created_at: 2026-03-13T02:27:05Z
closed_at: 2026-03-13T02:36:43Z
close_reason: "Fixed: inlineIncrementalRender now emits cursor suffix even when
  content unchanged"
owner: bjorn@stabell.org
---

# [x] Inline incremental early return drops cursor-only updates @km/_orphan #bug #P2

inlineIncrementalRender returns empty string when content unchanged but cursor moved. Fix: check cursor state before early return.


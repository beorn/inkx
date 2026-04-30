---
id: "@km/inbox/nehtg"
aliases:
  - km-nehtg
  - "@km/_orphan/nehtg"
created_by: claude:65d845d9
created_at: 2026-03-13T02:27:05Z
closed_at: 2026-03-13T02:36:43Z
close_reason: "Fixed: scrollOffset applied to contentY, clipBounds intersection added"
owner: bjorn@stabell.org
---

# [x] Non-scroll sticky pre-clear ignores clip bounds and scroll offset @km/_orphan #bug #P2

renderNormalChildren sticky force-refresh uses layout.y without scroll offset, no clipBounds intersection. Can wipe content outside visible region.
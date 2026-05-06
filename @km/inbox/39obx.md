---
mentions:
  - km
id: "@km/inbox/39obx"
aliases:
  - km-39obx
  - "@km/_orphan/39obx"
created_by: claude:97b8de73
created_at: 2026-02-22T20:57:19Z
closed_at: 2026-02-22T22:14:51Z
owner: bjorn@stabell.org
---

# [x] Collapsed sections (Activity) appear in card view @km/_orphan #bug #P2

isCollapsedChild() only filters body nodes in use-columns.ts. Collapsed structural nodes (e.g. Activity from Asana imports) are included in cardNodes and rendered in cards. They should only appear in detail view and columns.


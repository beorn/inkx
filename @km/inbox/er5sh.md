---
id: "@km/inbox/er5sh"
aliases:
  - km-er5sh
  - "@km/_orphan/er5sh"
created_by: claude:97b8de73
created_at: 2026-02-22T07:36:08Z
closed_at: 2026-02-22T12:37:09Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] H1 body content parsed as top-level items instead of body blocks @km/_orphan #bug #P1 @claude:97b8de73

When a ### (H3) item has body content containing # (H1) headings, the H1s are being treated as independent h-items instead of body content. This has been reported multiple times. Example: a task item '### [ ] Arthur school plan' contains H1 headings like '# 2025-26 school year' in its body - these should be body blocks, not outline items.
---
mentions:
  - km
  - claude
id: "@km/inbox/flexx-linechildren"
aliases:
  - km-flexx-linechildren
  - "@km/_orphan/flexx-linechildren"
created_at: 2026-01-31T21:00:28Z
closed_at: 2026-01-31T21:06:40Z
assignee: claude:b8b4780b
---

# [x] Avoid _lineChildren.push() backing store growth during layout @km/_orphan #task #P3 @claude:b8b4780b

_lineChildren.push() can trigger dynamic array growth during layout passes when child count exceeds previous capacity. Consider pre-sizing arrays or using index-based filling to avoid reallocation.


---
mentions:
  - km
id: "@km/tui/ff-columns"
aliases:
  - km-tui.ff-columns
  - km-tui-ff-columns
created_by: claude:b92140a2
created_at: 2026-03-17T05:58:14Z
closed_at: 2026-03-17T06:06:59Z
close_reason: Implemented expandIndexFileColumns in use-columns.ts. Both
  deriveColumnsFromRepo and deriveColumnsIncremental detect folder index files
  and expand their sections as columns. Embed slots (## ![[./child]]) resolve to
  folder children, inline sections become columns, unlisted children are
  appended. 10 new tests in duplicate-columns.test.ts all pass.
owner: bjorn@stabell.org
---

# [x] Column promotion in deriveColumnsFromRepo @km/tui #task #P2

Modify use-columns.ts to detect index files and expand their sections as columns. Embed slots resolve to actual children.


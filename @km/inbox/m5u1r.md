---
id: "@km/inbox/m5u1r"
aliases:
  - km-m5u1r
  - "@km/_orphan/m5u1r"
created_by: claude:a5c7f7de
created_at: 2026-02-15T14:57:12Z
closed_at: 2026-02-15T22:12:05Z
owner: bjorn@stabell.org
---

# [x] HR rendering uses content-based detection instead of type field @km/_orphan #bug #P2

CardColumn.tsx checks content matches HR pattern (---/***/___ etc) instead of relying on node.type which is set at parse time and never updated during editing.
---
id: "@km/_orphan/md79e"
aliases:
  - km-md79e
created_by: claude:ceb7c9cb
created_at: 2026-03-27T15:57:03Z
closed_at: 2026-03-27T15:57:08Z
close_reason: Changed slice(0, 8) to slice(-8) in getNodeDisplayName() — shows
  random suffix instead of timestamp prefix. Tests updated.
owner: bjorn@stabell.org
---

# [x] Short ID fallback shows ULID timestamp prefix instead of random suffix @km/_orphan #bug #P2

getNodeDisplayName() uses node.id.slice(0, 8) for untitled nodes, which shows the ULID timestamp prefix. Nodes created in the same millisecond (e.g., empty list items under sections parsed from one file) display identical short IDs. Fix: use slice(-8) to show the random suffix instead.
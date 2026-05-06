---
mentions:
  - km
  - beorn
id: "@km/inbox/6cfy"
aliases:
  - km-6cfy
  - "@km/_orphan/6cfy"
created_at: 2026-01-27T01:55:51Z
closed_at: 2026-01-27T01:58:21Z
assignee: beorn
---

# [x] bug: cursor up from column doesn't go to board (but 'u' does) @km/_orphan #bug #P2 @beorn

When pressing k (cursor up) from a column header, it should move to the board title, matching the behavior of 'u' (zoom out). The test at board.spec.ts:144 verifies this works, but user reports it doesn't work in actual use. Need to investigate discrepancy.


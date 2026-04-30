---
id: "@km/inbox/vnlce"
aliases:
  - km-vnlce
  - "@km/_orphan/vnlce"
created_by: claude:ceb7c9cb
created_at: 2026-03-27T15:10:01Z
closed_at: 2026-03-27T15:40:40Z
close_reason: Empty children (no name/title/content) no longer count in delete
  confirmation childCount. Both card-level and column-level delete paths filter
  empty nodes. 2 tests added.
owner: bjorn@stabell.org
---

# [x] feat: delete confirmation should ignore empty children @km/_orphan #feature #P2

When deleting a card like '2026-03-23 Weekly review' that has 3 section headings (Good, Bad, Change) each with an empty placeholder child, the confirmation shows '6 children will be deleted, 2 backlinks will break'. The 6 children are all near-empty (just IDs like (01KMPVNG)). Empty/trivial children shouldn't count toward the confirmation threshold — they make trivial deletes look scary. Also verify the 2 backlinks are real and not from empty nodes.
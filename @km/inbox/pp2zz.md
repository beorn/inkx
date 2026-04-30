---
id: "@km/inbox/pp2zz"
aliases:
  - km-pp2zz
  - "@km/_orphan/pp2zz"
created_by: claude:b509d761
created_at: 2026-02-10T12:11:05Z
closed_at: 2026-02-18T08:07:06Z
owner: bjorn@stabell.org
assignee: claude:5f0aee02
---

# [x] Mutation testing for cache invalidation code paths @km/_orphan #task #P3 @claude:5f0aee02

Deliberately inject known-wrong values into cache logic (flip a <= to <, swap sentinel from -1 to 0, skip markDirty propagation) and verify that the fuzz suite catches each mutation. If flipping a condition doesn't fail any test, that's a coverage gap. This validates that the 1100+ fuzz tests actually exercise both cache-hit and cache-miss paths. See docs/testing.md Mutation Testing section.
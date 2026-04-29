---
id: "@km/_orphan/qnjt-fix"
aliases:
  - km-qnjt-fix
created_at: 2026-01-24T19:48:04Z
closed_at: 2026-01-24T19:51:22Z
---

# [x] Fix h/l visual navigation for unrendered columns @km/_orphan #task #P1 @beorn

## Fixed in b714678

Changed approach: Instead of fallbacks, missing positions now throws.

**Rationale:** If card positions aren't registered, it's a programming error:
1. Columns being virtualized incorrectly (not all visible columns rendered)
2. Position registration broken (useScreenRectCallback not called)
3. Registry cleared unexpectedly

Throwing catches these bugs early instead of silently degrading UX.

Also fixed: command-bridge crash (cursor.length undefined) caused by
SimplifiedBoardState not having `cursor` and `nodes` arrays that 
@km/commands expected.
---
id: "@km/inbox/yje3"
aliases:
  - km-yje3
  - "@km/_orphan/yje3"
created_at: 2026-01-20T22:19:32Z
closed_at: 2026-01-20T22:20:22Z
---

# [x] Archive views-ink and legacy Ink engine code @km/_orphan #task #P1

The codebase has migrated to inkx but still contains legacy Ink-based views:

**Files to archive/remove:**
- `apps/km-tui/packages/km-ink/src/views-ink/` - entire directory
- `apps/km-tui/packages/km-ink/src/engines/ink/` - legacy Ink engine
- `apps/km-tui/packages/km-ink/src/layout/ink.ts` - Ink-specific layout

**Related machinery to review:**
- Engine selection/switching code (if any remains)
- Any imports from views-ink in active code
- Tests that specifically test Ink vs inkx

**Action:**
1. Verify no active code imports from views-ink
2. Move to archive/ or delete entirely
3. Remove any engine-switching logic that's no longer needed
4. Update any docs that reference views-ink
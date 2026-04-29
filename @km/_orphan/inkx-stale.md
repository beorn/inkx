---
id: "@km/_orphan/inkx-stale"
aliases:
  - km-inkx-stale
created_at: 2026-02-03T12:11:11Z
closed_at: 2026-02-04T11:23:52Z
---

# [x] inkx: incremental rendering stale pixel bugs (4 bugs + paintDirty rename) @km/_orphan #bug #P1 @claude:227cdc41

Based on GPT-5.2 deep code review + user-reported board title row bug.

## Bug Reports
- **Board title row**: When cursor moves away from board level, title Text bg turns black instead of white. Parent Box paints white, then child Text clearing overwrites with bg=null=black.
- **Column headers (@km/_orphan/jmxuh)**: Yellow bg sticks when header deselected. Fixed by styleDirty flag, but clearing logic has additional issues.

## Issues
1. **Bug 1: Clearing destroys parent bg** - content-phase.ts:111 fills with bg=null, destroying parent's painted background
2. **Bug 2: Fast-path skips styleDirty nodes** - content-phase.ts:84 missing !node.styleDirty in fast-path condition
3. **Bug 3: Node shrinking leaves stale pixels** - content-phase.ts:99-113 only clears new layout bounds, not old excess area
4. **Bug 4: Scroll container clearing destroys parent bg** - content-phase.ts:189 same as Bug 1 in scroll context
5. **Improvement: Rename styleDirty → paintDirty** - Better reflects visual invalidation semantics
---
id: "@km/inbox/pii3"
aliases:
  - km-pii3
  - "@km/_orphan/pii3"
created_at: 2026-01-20T08:11:10Z
closed_at: 2026-01-20T11:02:47Z
---

# [x] InkX: Layout jumps during view cycling and cursor movement @km/_orphan #bug #P1

When cycling between views (cards -> columns -> list -> cards) and moving the cursor, the text layout jumps around. Sometimes content is left-aligned, other times pushed 30-40 characters to the right. Appears to be a rendering issue where column positions aren't being reset properly between renders.

ADDITIONAL SYMPTOMS:
- Bottom bar sometimes gets overwritten by content from views
- After view transitions, bottom bar may show incorrect content

INVESTIGATION NOTES:
- pipeline.ts contentPhase creates buffer sized from root.computedLayout, not terminal dimensions
- layoutPhase skips recalculation if hasLayoutDirtyNodes() returns false (might miss dimension changes)
- changesToAnsi uses optimized cursor movement that may not properly clear old content
- The '\r\n' optimization at line 1145 may cause issues if terminal wraps differently

AREAS TO CHECK:
1. Buffer dimensions vs terminal dimensions in contentPhase
2. Layout dirty detection when view mode changes
3. Diff algorithm handling of content that was removed/moved
4. Overflow handling in views that contain top/bottom bars

Reproduction:
1. Run: km view -r /tmp/test-repo @next.md --tui inkx
2. Cycle through views with 'v' key multiple times
3. Move cursor around with h/j/k/l
4. Observe text jumping to different horizontal positions
5. Check bottom bar after each transition - may show wrong content
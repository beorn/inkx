---
id: "@km/_orphan/yjuf"
aliases:
  - km-yjuf
created_at: 2026-01-16T15:31:59Z
closed_at: 2026-01-16T16:18:32Z
---

# [x] Rename NAV_* actions to CURSOR_* convention @km/_orphan #task #P2

Unify all cursor movement actions under CURSOR_* prefix.

**Before:**
- CURSOR_UP/DOWN/LEFT/RIGHT (visual)
- NAV_PREV_SIBLING/NEXT_SIBLING/PARENT/CHILD (structural)
- JUMP_TOP/BOTTOM, MOVE_UP/DOWN/LEFT/RIGHT (deprecated)

**After:**
- CURSOR_UP/DOWN/LEFT/RIGHT (visual - spatial)
- CURSOR_PREV/NEXT/IN/OUT (structural - tree)
- CURSOR_FIRST/LAST (jump to boundary)

See plan: ~/.claude/plans/peppy-puzzling-goblet.md
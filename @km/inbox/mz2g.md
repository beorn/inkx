---
mentions:
  - km
id: "@km/inbox/mz2g"
aliases:
  - km-mz2g
  - "@km/_orphan/mz2g"
created_at: 2026-01-21T22:46:18Z
closed_at: 2026-01-23T12:40:22Z
---

# [x] Board.tsx is 2169 lines - needs splitting @km/_orphan #task #P3

---

## Progress Update (2026-01-22)

### Phase 1 Complete ✓

- Extracted handleCommandAction and 15+ handlers from Board.tsx to board-actions.ts (860 lines)
- Board.tsx reduced from 2169 to 1172 lines (46% reduction)
- Tests passing

### Phases 2-4: Deferred

The full executable commands architecture (Ctx type, When predicates, BINDINGS array) is a larger change. Current action dispatch pattern works and is now maintainable.

Recommend: Close this bead as Phase 1 done, create separate P4 bead for full executable commands if desired later.


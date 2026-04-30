---
id: "@km/inbox/z1yx"
aliases:
  - km-z1yx
  - "@km/_orphan/z1yx"
created_at: 2026-01-16T11:50:54Z
closed_at: 2026-01-16T12:03:49Z
---

# [x] Duplicate code: board reducers in km-core and km-board @km/_orphan #task #P3

**Duplicate code**: Board reducer exists in two packages with different implementations.

Files:
- packages/@km/_orphan/core/src/board/boardReducer.ts (350 lines) - Legacy
- packages/@km/_orphan/board/src/boardReducer.ts (537 lines) - Enhanced

@km/_orphan/core version uses legacy action names (MOVE_UP, MOVE_DOWN).
@km/_orphan/board version adds CURSOR_*/EXTEND_SELECT_*/SHIFT_* actions.

Fix: Migrate @km/_orphan/core/board users to @km/_orphan/board, deprecate @km/_orphan/core/board.
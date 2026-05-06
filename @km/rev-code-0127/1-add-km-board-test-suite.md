---
mentions:
  - km
id: "@km/rev-code-0127/1-add-km-board-test-suite"
aliases:
  - km-rev-code-0127.1
  - km-rev-code-0127-1
  - "@km/rev-code-0127/1"
created_at: 2026-01-27T14:28:35Z
closed_at: 2026-01-27T19:58:37Z
---

# [x] Add km-board test suite @km/rev-code-0127 #bug #P1

**Critical**: @km/_orphan/board package has ZERO tests for critical navigation layer

Untested exports:

- boardReducer (state reducer function)
- createBoardState (state initialization)
- board-reducer-new.ts (unclear migration status)

Test coverage needed:

- State initialization
- Cursor movement (next/prev/first/last)
- Selection mechanics
- Fold/unfold behavior
- Zoom (navigate in/out)
- Edge cases (empty board, single item)

Location: packages/@km/_orphan/board/ (currently only .gitkeep in tests/)


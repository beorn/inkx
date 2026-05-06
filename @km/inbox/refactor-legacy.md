---
mentions:
  - km
id: "@km/inbox/refactor-legacy"
aliases:
  - km-refactor-legacy
  - "@km/_orphan/refactor-legacy"
created_at: 2026-01-24T21:50:45Z
closed_at: 2026-01-24T22:13:35Z
---

# [x] Delete board-reducer-legacy.ts and cursor helpers @km/_orphan #task #P2

Delete legacy board reducer and cursor navigation helpers after migration.

**Files to delete:**

- packages/@km/_orphan/board/src/board-reducer-legacy.ts
- packages/@km/_orphan/board/src/board-reducer-cursor.ts
- Legacy boardReducer export from board-reducer.ts

**Changes:**

- Remove exports from index.ts
- Update any remaining test files
- Verify no consumers remain

**Dependencies:**

- Blocked by: @km/_orphan/refactor-repl, @km/_orphan/refactor-rename


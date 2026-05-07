---
mentions:
  - km
id: "@km/rev-code-0127/4-split-large-files-repo-ts-board-actions-ts"
aliases:
  - km-rev-code-0127.4
  - km-rev-code-0127-4
  - "@km/rev-code-0127/4"
created_at: 2026-01-27T14:28:38Z
closed_at: 2026-01-27T14:40:44Z
---

# [x] Split large files (repo.ts, board-actions.ts) @km/rev-code-0127 #task #P2

**High**: Large files need splitting for maintainability

Priority 1 (>1200 lines):

1. packages/@km/storage/src/repo.ts (1,385 lines)
- Split into: repo-core.ts, repo-hooks.ts, repo-mutations.ts, repo-test.ts
4. apps/@km/tui/src/board-actions.ts (1,230 lines)
- Split by category: zoom, nav, selection, edit, core

Priority 2 (>800 lines):
3. apps/@km/tui/src/views/Board.tsx (825 lines)

- Separate rendering logic from state management

Also consider: repo-loader.ts (1,236), reconcile.ts (1,166), sync.ts (863)


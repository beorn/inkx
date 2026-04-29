---
id: "@km/rev-0129/7-evaluate-large-files-for-decomposition"
aliases:
  - km-rev-0129.7
  - km-rev-0129-7
  - "@km/rev-0129/7"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Evaluate large files for decomposition @km/rev-0129 #task #P3 @claude:298008b9

Files over 600 lines that may benefit from splitting:
- packages/@km/storage/src/repo-loader.ts (1377 lines) - well-structured pipeline
- packages/@km/storage/src/repo.ts (1265 lines) - domain object
- packages/@km/storage/src/watch/reconcile.ts (1050 lines) - sync logic
- apps/@km/tui/src/views/Board.tsx (832 lines) - documented 3-layer architecture
- apps/@km/_orphan/cli/src/commands/daemon.ts (617 lines) - monolithic

Evaluate for DRY violations and composability improvements.
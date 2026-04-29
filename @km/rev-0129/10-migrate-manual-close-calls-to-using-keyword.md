---
id: "@km/rev-0129/10-migrate-manual-close-calls-to-using-keyword"
aliases:
  - km-rev-0129.10
  - km-rev-0129-10
  - "@km/rev-0129/10"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Migrate manual .close() calls to using keyword @km/rev-0129 #task #P4 @claude:298008b9

60+ instances of manual .close()/.stop()/.end() calls that could use 'using' + Symbol.dispose:
- packages/@km/storage/src/repo.ts (4 close calls)
- packages/@km/storage/tests/sync/chaos/*.ts (10+ close calls)
- apps/@km/_orphan/cli/src/commands/*.ts (various)

Migrate incrementally where resources support disposable pattern.
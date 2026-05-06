---
mentions:
  - km
  - claude
id: "@km/rev-0129/1-fix-app-layer-imports-from-storage-internal"
aliases:
  - km-rev-0129.1
  - km-rev-0129-1
  - "@km/rev-0129/1"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
assignee: claude:298008b9
---

# [x] Fix APP layer imports from storage/internal @km/rev-0129 #task #P1 @claude:298008b9

7 files in apps/ import deprecated singletons from @km/storage/internal/:

- apps/@km/tui/src/tui.ts:15 (setFsSync)
- apps/@km/_orphan/cli/src/commands/daemon.ts:27 (setEventHub, setFsSync)
- apps/@km/_orphan/cli/src/commands/bd.ts:26 (getDbPath)
- apps/@km/_orphan/cli/src/commands/rebuild.ts:24-25 (getDbPath, getEventsPath, runWithKmDir)
- apps/@km/_orphan/cli/src/commands/sync.ts:24 (runWithKmDir)
- apps/@km/_orphan/cli/tests/@km/repl/ts:26 (closeDb)

Should use Repo domain object instead. Check for code duplication across these files.


---
id: "@km/remove-singletons"
aliases:
  - km-remove-singletons
  - "@km/_orphan/remove-singletons"
created_at: 2026-01-23T20:58:56Z
closed_at: 2026-01-25T08:15:02Z
---

# [x] Remove all deprecated singletons from km @km/remove-singletons #epic #P1 @73ce0af2

Migrate all code from deprecated singleton APIs (setKmDir, getKmDir, getDb, setDb, etc.) to domain object pattern (createVault, runWithDb, runWithKmDir).

Target files:
- @km/_orphan/cli commands (sync.ts, daemon.ts, rebuild.ts, bd.ts)
- @km/tui tests (board.slow.test.ts, detail-pane.test.ts, board-move-elaborate.test.ts)
- @km/_orphan/cli tests (cli-unit.test.ts)

End state: All @deprecated functions can be removed from public exports.
---
mentions:
  - km
  - Bjørn
id: "@km/storage/sync-ownership"
aliases:
  - km-storage.sync-ownership
  - km-storage-sync-ownership
created_by: Bjørn Stabell
created_at: 2026-04-01T05:46:59Z
closed_at: 2026-04-02T21:41:12Z
close_reason: "Completed: WriteToken architecture implemented across 7 phases.
  Phase 1 (WriteTokenMap), Phase 2 (guard removal), Phase 3 (shared emitter +
  skipFsSync), Phases 4+6 (silent failures F1-F10), Phase 5 (rename tokens +
  journal), Phase 7 (ordinal-drift + move-disk). See km-storage.sync-refactor
  epic for full history."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Sync ownership model: DB-authoritative for user edits, file-authoritative for external changes @km/storage #task #P1 @Bjørn Stabell

Current sync has no clear ownership — reconciliation runs during user writes, causing data loss. Design: user events = DB authority (generate file, suppress watcher), watcher events = file authority (parse file, update DB). No reconcile-before-write during user edits. Current 5-layer defensive patches (recentWrites, node-differ guards) are duct tape — this bead replaces them with a clean architecture.


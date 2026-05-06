---
mentions:
  - km
id: "@km/storage/reconcile-clobbers-edits"
aliases:
  - km-storage.reconcile-clobbers-edits
  - km-storage-reconcile-clobbers-edits
created_by: Bjørn Stabell
created_at: 2026-04-01T04:58:33Z
closed_at: 2026-04-01T05:11:09Z
close_reason: "Four fixes applied: (1) repo.ts renameNode no longer
  short-circuits for new nodes, (2) event-handlers.ts removed reconcileIfChanged
  for user events, (3) node-differ.ts protects non-empty name/content from empty
  overwrite, (4) sync.ts recentWrites Map tracks files written by us —
  reconciliation skips recently-written files within 10s window. (5) nodes2md.ts
  uses || not ?? for title fallback (empty string was blocking content).
  Verified in real vault: Enter+type+Enter persists across restarts."
owner: bjorn@stabell.org
---

# [x] Watcher reconciliation overwrites inline edit content from stale file @km/storage #bug #P0

When user edits an mdsection node (Enter + type + Enter), the save correctly updates DB (name + content). But the FS sync writes the file BEFORE the name is saved, producing empty ## headings. The watcher then detects the file change, reconciles from the stale file, and overwrites the DB content/name with empty strings. Three partial fixes applied: (1) repo.ts renameNode no longer short-circuits for new nodes, (2) event-handlers.ts removed reconcileIfChanged for user events, (3) node-differ.ts protects non-empty name/content from empty overwrite. But the watcher's periodic reconciliation still reads stale files. Proper fix: track last-write timestamp per file in SyncManager, skip reconciliation for recently-written files.


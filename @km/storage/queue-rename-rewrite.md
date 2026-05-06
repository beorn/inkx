---
mentions:
  - km
id: "@km/storage/queue-rename-rewrite"
aliases:
  - km-storage.queue-rename-rewrite
  - km-storage-queue-rename-rewrite
created_by: Bjørn Stabell
created_at: 2026-04-02T22:06:15Z
closed_at: 2026-04-02T22:21:01Z
close_reason: "Shipped: WriteQueue.renamePending + dropPending +
  renamePendingSubtree. Wired into handleFileRename/handleFolderRename before
  renameSync. Prevents stale-path writes after rename. 13 tests with edge cases.
  Commits 83888cc1, 1a4637a2, 1886350c."
owner: bjorn@stabell.org
---

# [x] [bug] WriteQueue pending writes not rewritten on rename — stale path flushed @km/storage #bug #P2

GPT 5.4 Pro identified: If user edits note then renames before debounce flush, queued write still targets old path. renameSync runs immediately, then queued write recreates old file.

FIX: Add WriteQueue methods:

- renamePending(oldPath, newPath) — rewrite queued path
- dropPending(path) — cancel queued write for deleted file
- subtree path rewrite for folder renames

Without this, rename tokens alone are not enough.


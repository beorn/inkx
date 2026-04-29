---
id: "@km/storage/atomic-writes"
aliases:
  - km-storage.atomic-writes
  - km-storage-atomic-writes
created_by: Bjørn Stabell
created_at: 2026-04-02T22:06:18Z
closed_at: 2026-04-02T22:21:04Z
close_reason: "Shipped: WriteQueue uses temp+rename pattern (.km-tmp suffix).
  Watcher marks both temp and final paths in-flight. Temp file cleaned on rename
  failure. .km-tmp added to default ignore patterns. Commit efba271c."
owner: bjorn@stabell.org
---

# [x] Atomic file writes via temp+rename pattern @km/storage #task #P3

GPT 5.4 Pro recommended: km writes directly to target path, so watcher and external readers can observe partially-written content. Use write-to-temp + fsync + atomic-rename pattern. Also simplifies echo handling since watcher sees rename, not incremental write.
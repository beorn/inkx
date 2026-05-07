---
mentions:
  - km
id: "@km/disposable-2/3-use-asyncdisposablestack-for-complex-sync-tests"
aliases:
  - km-disposable-2.3
  - km-disposable-2-3
  - "@km/disposable-2/3"
created_at: 2026-01-23T21:43:07Z
closed_at: 2026-01-23T21:53:20Z
---

# [x] Use AsyncDisposableStack for complex sync tests @km/disposable-2 #task #P3

bidirectional-sync.test.ts and db-to-fs.test.ts need multiple cleanup actions. Use AsyncDisposableStack with defer() for setFsSync(null) and use() for syncManager.


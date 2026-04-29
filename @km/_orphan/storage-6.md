---
id: "@km/_orphan/storage-6"
aliases:
  - km-storage-6
created_at: 2026-01-20T10:32:29Z
closed_at: 2026-02-14T08:55:33Z
---

# [x] Split store.ts into focused modules @km/_orphan #task #P3 @claude:124bfbe5

packages/@km/storage/src/store.ts is 864 lines combining NodeStore interface, DiskStore and MemoryStore implementations. Split into store.ts (interface), disk-store.ts, memory-store.ts.
---
id: "@km/storage/memory-store"
aliases:
  - km-storage.memory-store
  - km-storage-memory-store
created_by: Bjørn Stabell
created_at: 2026-04-03T05:39:01Z
closed_at: 2026-04-03T06:40:11Z
close_reason: "Done via createStoreFromRepo — wraps existing Repo as Store &
  Observable & Replicated. withReactive adds per-node signals. Commits: 573c7deb
  through a38afe4d."
---

# [x] Phase 2: createMemoryStore — Store + Reactive @km/storage #task #P3

In-memory implementation with entity signals. Map<id, Signal<ResourceState<KNode>>>. First concrete store.
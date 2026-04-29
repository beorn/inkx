---
id: "@km/storage/sync-architecture"
aliases:
  - km-storage.sync-architecture
  - km-storage-sync-architecture
created_by: Bjørn Stabell
created_at: 2026-03-31T21:42:54Z
owner: bjorn@stabell.org
---

# [ ] Sync architecture consolidation — centralize flows, clear layers, quality plateau @km/storage #task #P2

Bring the sync pipeline to a quality plateau. Currently spread across ~10 files with overlapping concerns. Goal: single entry point, clearly-named phases, uniform error handling, architectural documentation. Should be done AFTER P0/P1 fixes stabilize behavior. Includes: consolidate fs-writer + sync overlap, clear responsibility boundaries, inline flow documentation, sync/README.md with pipeline diagram.
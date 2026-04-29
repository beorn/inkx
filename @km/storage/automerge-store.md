---
id: "@km/storage/automerge-store"
aliases:
  - km-storage.automerge-store
  - km-storage-automerge-store
created_by: Bjørn Stabell
created_at: 2026-04-03T05:39:07Z
closed_at: 2026-04-22T06:05:13Z
close_reason: Superseded by km-storage.pathway-db-crdt. The old Phase 6
  'createAutomergeStore' plan is now Phase D of the A→E pathway, and Phase D
  comes with a Rust/Zig native-rewrite escape hatch (see
  hub/km/storage-architecture.md §9). Carrying both beads creates a false
  parallel roadmap.
owner: bjorn@stabell.org
---

# [x] Phase 6: createAutomergeStore — Store + Syncable (CRDT collab) @km/storage #task #P4

Automerge-backed store for multi-device sync. DocHandle per node (kimmi pattern). CRDT patches → RepoDelta. Depends on Phase 4 sync.
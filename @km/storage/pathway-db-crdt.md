---
mentions:
  - km
id: "@km/storage/pathway-db-crdt"
aliases:
  - km-storage.pathway-db-crdt
  - km-storage-pathway-db-crdt
created_by: claude:8b5b9e1c
created_at: 2026-04-22T04:47:06Z
closed_at: 2026-04-26T06:24:17Z
close_reason: All children completed
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.pathway-db-crdt
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T22:30:09Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] Pathway tracker: Phase A → E (FS-truth → op log → DB-truth → CRDT → sync platform) @km/storage #epic #P3

blocks:: [[@km/storage]]

Named pathway Phase A → E from current FS-truth to a large-scale sync platform. Non-scheduled; tracks trigger evidence and keeps Phase-A implementation decisions compatible with later phases. See hub/km/storage-architecture.md §9.

Value unlocks per phase:

- Phase A (current): FS-truth + git sync; Obsidian-compatible km
- Phase B: semantic op log alongside FS → semantic undo/redo + multi-file atomicity via replay
- Phase C: DB-as-truth flip → versioning/snapshots/rollback + typed per-block metadata + agent state as first class
- Phase D: CRDT substrate under DB → real-time collab + offline-online merge. Likely paired with Rust/Zig native-storage rewrite for perf (kimmi precedent).
- Phase E: km as Dropbox/gdrive/iCloud-class sync platform → million-file workspaces, binary blobs, selective sync, sharing, cloud infra.


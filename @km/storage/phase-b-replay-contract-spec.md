---
mentions:
  - km
  - claude
id: "@km/storage/phase-b-replay-contract-spec"
aliases:
  - km-storage.phase-b-replay-contract-spec
  - km-storage-phase-b-replay-contract-spec
created_by: claude:8b5b9e1c
created_at: 2026-04-22T06:45:13Z
closed_at: 2026-04-22T14:50:55Z
close_reason: "Shipped: hub/km/phase-b-replay-contract-2026-04-22.md (577 lines
  / ~5540 words). DQ1-DQ5 answered with rationale. Key decisions: extend
  changes.jsonl (no dual-write), snapshot+ops replay contract, origin-tagged
  fs-watch events skipped on replay, task_* as tagged aliases, oplog boundary at
  schema-stable. Prereq for Phase B scheduling."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.phase-b-replay-contract-spec
    depends_on_id: km-storage.pathway-db-crdt
    type: parent-child
    created_at: 2026-04-21T23:45:13Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage.pathway-db-crdt
---

# [x] Phase B replay contract spec (DQ1-DQ5) @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage/pathway-db-crdt]]

Write the Phase B design doc covering: DQ1 oplog vs changes.jsonl (retention, compaction), DQ2 replay-against-snapshot contract (replay-from-epoch is a no-op given node_deleted semantics), DQ3 fs-watch op handling in the oplog (tag or split?), DQ4 task_* as aliases vs node_updated, DQ5 migration-era DB writes boundary. Prerequisite for scheduling Phase B (@km/storage/pathway-db-crdt). From audit hub/km/research/op-vocabulary-audit-2026-04-22.md.


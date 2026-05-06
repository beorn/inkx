---
mentions:
  - km
  - claude
id: "@km/storage/pipeline-update-file-metadata-emit"
aliases:
  - km-storage.pipeline-update-file-metadata-emit
  - km-storage-pipeline-update-file-metadata-emit
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:35:54Z
closed_at: 2026-04-22T17:31:49Z
close_reason: "Shipped commit e127ad7e3. updateFileMetadata queues into
  pendingMetadataEmits buffer, drained via emitter.commit after each BEGIN
  IMMEDIATE...COMMIT block (mirrors applyLinks carve-out — appendFileSync can't
  roll back with SQL). Bootstrap fallback (no emitter) preserved. 3 tests pass:
  single-file emitter, multi-file batch, bootstrap fallback."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.pipeline-update-file-metadata-emit
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T08:35:54Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] Route pipeline updateFileMetadata through emitter (finish embed_of/block_id standardization) @km/storage #task #P3 @claude:8b5b9e1c

blocks:: [[@km/storage]]

The embed-blockid-standardize bead (closed 2026-04-22) fixed 5 sites but agent explicitly flagged a 6th: pipeline.ts:454 updateFileMetadata has the same 'direct db.run + emitNodeUpdated' double-write pattern, not named in the audit, intentionally left untouched per 'do not touch sites not named' rule. This bead closes that site.

## Scope

- packages/@km/storage/src/markdown/pipeline.ts updateFileMetadata: replace direct db.run + emit with single emitter.commit
- Test: assert single paired write


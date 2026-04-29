---
id: "@km/storage/op-surface-embed-blockid-standardize"
aliases:
  - km-storage.op-surface-embed-blockid-standardize
  - km-storage-op-surface-embed-blockid-standardize
created_by: claude:8b5b9e1c
created_at: 2026-04-22T06:45:14Z
closed_at: 2026-04-22T15:19:11Z
close_reason: "Shipped: 5 sites refactored to emitter.commit — update-handler
  embed_of, create-handler embed_of, change-handlers block_id (was never
  journaled), change-handlers baseline-hash realignment (was never journaled),
  pipeline.ts embed_of batch (optional emitter threaded through applyLinks).
  Discovered double-write anti-pattern in update+create handlers (audit said
  'already correct' — was actually redundant db.run + emit). 4 new tests in
  embed-blockid-emits.test.ts. 7172 fast-suite pass. Closes G4/G7/G9."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.op-surface-embed-blockid-standardize
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T23:45:14Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Standardize emitter.apply for embed_of / block_id / content_hash back-writes @km/storage #task #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]]

Audit findings G4/G7/G9: update-handler.ts:197, create-handler.ts:223, change-handlers.ts:144,266, pipeline.ts:322 — two of these already emit node_updated; remaining writes just need to follow the same pattern. Effort: ~0.5-1 day. Blocks Phase B op-surface closure.
---
id: "@km/storage/reconcile-origin-journal-decision"
aliases:
  - km-storage.reconcile-origin-journal-decision
  - km-storage-reconcile-origin-journal-decision
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:35:55Z
closed_at: 2026-04-22T17:20:14Z
close_reason: "Decision: reconcile-origin ops journal with
  origin='fs-reconcile', filtered on replay (same treatment as fs-watch).
  Documented in phase-b-replay-contract-2026-04-22.md §4.5. Implementation
  trigger: flip skipPersist when op-surface closure ships."
---

# [x] Design decision: should reconcile-origin node_createds journal? @km/storage #task #P3 @claude:8b5b9e1c

blocks:: [[@km/storage]]

From the route-scanner bead (closed 2026-04-22): 'disk-mode post-replay reconcile node_createds historically didn't hit the journal either — the current manual-insert path already skipped persist. Routing them through emitter.commit({skipPersist:true, ...}) preserves that behavior but flags a separate gap (reconcile-originated node_createds should arguably be journaled). Left out of scope for this bead.'

## Question
Should files newly discovered during post-replay reconciliation emit journaled node_created events? Arguments:
- **Yes, journal them**: Phase B replay needs every content mutation in the log. Files appearing on disk are content mutations.
- **No, skip**: Reconcile-origin files are derivable from FS scan on replay. Journaling them is redundant.

Likely answer: journal them with origin='fs-reconcile' — consistent with the op-vocabulary audit's conclusion that the log should be a complete op-surface stream.

## Scope
- Decision captured in hub/km/storage-architecture.md or phase-b-replay-contract-2026-04-22.md
- If 'yes': scope an implementation bead
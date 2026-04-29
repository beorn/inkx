---
id: "@km/storage/store-interface"
aliases:
  - km-storage.store-interface
  - km-storage-store-interface
created_by: Bjørn Stabell
created_at: 2026-04-03T05:39:00Z
closed_at: 2026-04-03T06:40:08Z
close_reason: "Done. Store + Observable + Replicated interfaces,
  createStoreFromRepo wrapper, committed change log. Commits: 7425f739,
  a38afe4d."
---

# [x] Phase 1: Store + trait interfaces — base API design @km/storage #task #P3

Phase 1 expanded: define commit taxonomy + trait interfaces.

Step 0: Operation vs Event vs ChangeEnvelope distinction
- Operation: user intent (editor.apply receives these)
- Event: canonical state mutation (store.commit produces these)  
- ChangeEnvelope: replicated committed change with metadata

Commit metadata: { commitId, source, actorId, basis }
CommitSource: "local" | "undo" | "redo" | "fs-import" | "remote"

Then define trait interfaces:
- Store (peekNode, peekChildIds, commit → CommitResult)
- Observable (onCommit)
- Reactive extends Observable (nodeState, childIdsState)
- Loadable (ensureNode, ensureChildIds)
- Flushable (flush)
- Replicated (getChanges, applyChanges)
- ResourceState<T>
- RepoDelta
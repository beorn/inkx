---
id: "@km/storage/reactive-store"
aliases:
  - km-storage.reactive-store
  - km-storage-reactive-store
created_by: Bjørn Stabell
created_at: 2026-04-03T05:37:00Z
owner: bjorn@stabell.org
---

# [ ] [epic] Reactive Store — trait-based, backend-swappable, signals as UI bridge @km/storage #epic #P2

## Architecture: Store → Editor via pipe()

\`\`\`typescript
const editor = pipe(
  createSQLiteStore(db),   // authority — raw persistence
  withHistory,              // record committed effects for undo
  withTree,                 // normalize after every commit
  withSelection,            // transform Point/Range (commit subscriber)
  withReactive,             // signals from delta (commit subscriber)
  withSync(fsPeer),         // FS projection (commit subscriber)
)

editor.apply(op)  // one verb, composed behavior
\`\`\`

### Three Concerns (never mixed)

\`\`\`
State:         store.commit(events) → CommitResult { events, delta, meta }
Invalidation:  RepoDelta → per-node signals → UI re-renders
Replication:   ChangeEnvelope { commitId, source, actor, basis, events }
\`\`\`

### Implemented ✓

- **CommitMeta, CommitResult, RepoDelta, ResourceState, ChangeEnvelope** — commit-types.ts
- **computeDelta** — derive RepoDelta from events
- **getChildIds** — structural read returns IDs not full nodes
- **Store + Observable interfaces** — peekNode, peekChildIds, commit, onCommit
- **Replicated interface** — getChanges(since?), applyChanges() with change log
- **createStoreFromRepo** — wraps Repo as Store & Observable & Replicated
- **withReactive** — per-node signals from RepoDelta (alien-signals)
- **useNodeResource / useChildIdsResource** — ResourceState at UI boundary
- **FakeRepo mutations** — apply actually processes events (for testing)

### Remaining

- **Phase 3**: createSQLiteStore — direct SQLite implementation of Store
- **Phase 4**: withSync as commit subscriber (not apply wrapper)
- **Phase 5**: createFsStore — FS as sync peer / projection adapter
- **Phase 6**: createAutomergeStore (P4, deferred)
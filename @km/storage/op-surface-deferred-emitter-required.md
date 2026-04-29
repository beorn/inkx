---
id: "@km/storage/op-surface-deferred-emitter-required"
aliases:
  - km-storage.op-surface-deferred-emitter-required
  - km-storage-op-surface-deferred-emitter-required
created_by: claude:8b5b9e1c
created_at: 2026-04-22T17:30:50Z
---

# [ ] Deferred parser must emit via emitter (audit G2) @km/storage #task #P2

blocks:: [[@km/storage]]

Audit G2: packages/@km/storage/src/markdown/deferred.ts has zero emitter.apply / emitter.commit calls. Both parseDeferredAsync and parseStubFile mutate the DB directly. For Phase B, replay will miss content parsed via the deferred path (stubs that get promoted post-discover, or files parsed by the worker pool after initial board render).

## Scope
1. Add optional emitter parameter to parseDeferredAsync + parseStubFile signatures
2. Route every INSERT_NODE_SQL via emitter.commit({ type: 'node_created', source: 'fs-import', ...}, { db, skipPersist: false })
3. Wire callers (repo/loader.ts, pipeline.ts) to pass their emitter
4. Tests: assert node_created journal entries after deferred parse

## /complete
- grep 'INSERT INTO nodes' packages/@km/storage/src/markdown/deferred.ts → 0 hits (or: only via emitter.commit path)
- Test: parseStubFile on a collapsed file emits node_created + node_updated for link insertions, journal entries match DB writes

## Related
- Sibling pattern shipped in @km/storage/op-surface-route-scanner (commit c121aa8e0) for scanner/loader
- Phase B replay contract spec §10.1 names this bead as a Phase B prerequisite
---
id: "@km/storage/lazy-hydration"
aliases:
  - km-storage.lazy-hydration
  - km-storage-lazy-hydration
created_by: claude:8b5b9e1c
created_at: 2026-04-21T08:22:41Z
closed_at: 2026-04-22T06:51:55Z
close_reason: "Shipped: peek* now SQLite-on-demand for repo-backed stores
  (createSQLiteStore already was), new backlinksState(nodeId) reactive signal,
  RepoDelta.linkChanges for targeted backlink invalidation, notifyLinkChange()
  imperative entry for direct-DB link writes. 17 tests pass including perf
  (construction <50ms on 10k, peekNode median <1ms). fs-mount package extraction
  deferred as cosmetic refactor (BaseStore boundary already exists in
  practice)."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.lazy-hydration
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T22:30:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.lazy-hydration
    depends_on_id: km-storage.fs-mount
    type: blocks
    created_at: 2026-04-21T15:30:39Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.lazy-hydration
    depends_on_id: km-storage.identity-schema
    type: blocks
    created_at: 2026-04-21T21:50:02Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.lazy-hydration
    depends_on_id: km-storage.three-seam-boundary
    type: blocks
    created_at: 2026-04-21T12:05:30Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Lazy hydration (the scale fix): SQLite-on-demand queries, <500ms cold start on 100k files @km/storage #feature #P0 @claude:8b5b9e1c

blocks:: [[@km/storage]], [[@km/storage/fs-mount]], [[@km/storage/identity-schema]], [[@km/storage/three-seam-boundary]]

The scale fix — P0. Depends on @km/storage/identity-schema (queries must target post-schema shape).

## What exists today
`packages/km-storage/src/store/reactive.ts` — `withReactive()` decorator that lazy-creates per-node + per-parent-child-list signals, subscribes to `store.onCommit`, does targeted refresh from commit delta. Already uses alien-signals + batching. Works unchanged after lazy-hydration; only the underlying `peekNode` source shifts.

## What this bead does
1. Swap `peekNode` / `peekChildIds` (in BaseStore) to SQLite-on-demand (indexed lookups, microseconds each)
2. Extend the Reactive interface with `backlinksState(nodeId)` — subscribes to link-table changes through commit delta; only visible nodes keep live signals
3. Ensure commit delta carries link changes (for targeted backlink invalidation, not broad refresh)
4. Keep BaseStore's public interface stable — queries target the backend-agnostic face, not monolith internals. This keeps hydration layer backend-agnostic for Phase B+ (event-sourced materialized views, CRDT-backed store).

## Scale pattern
- Only visible nodes have live signals (lazy creation via alien-signals; offscreen GC when no subscribers)
- `alien-projections` available if we want windowed per-row reactivity for backlinks list — not required for Phase A
- No materialized views, no differential dataflow — SQLite indexed lookups + delta-driven invalidation are sufficient at 100k files

## Target
<500ms cold start on 10x vault (100k files). Today's full-load-to-memory breaks at 2x (see research/scale-bench-results-2026-04-21.md).
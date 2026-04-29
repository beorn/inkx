---
id: "@km/storage"
aliases:
  - km-storage
  - "@km/_orphan/storage"
created_at: 2026-02-04T11:50:23Z
---

# [ ] Storage layer (sync, queries, coverage) @km/storage #epic #P3

**TRACKING EPIC for km storage layer** — permanent scope epic. See `/pm` skill and `bd list --parent km-storage` for current work.

## Canonical design

`hub/km/storage-architecture.md` is the v3 doc (2026-04-22). It covers truth model, identity, reconciliation, safe markdown writeback, federation, and the Phase A→E pathway (FS-truth → op log → DB-truth → CRDT → sync platform).

External reviews archived in `hub/km/research/`:
- storage-arch-pro-review-round-2-2026-04-22.md (Kimi K2.6)
- storage-arch-pro-review-round-3-2026-04-22.md (GPT-5.4 Pro + Kimi K2.6)

## Phase A work (in-flight)

Critical path: P0 (identity schema) → P1 (lazy hydration) → P2 (FsMount + reconciliation) → P3 (corpus-gated writeback) → P4 (federation).

- **@km/storage/identity-schema** (P0) — block_id→name fold, branded types, file basename/path split. Blocks lazy-hydration.
- **@km/storage/lazy-hydration** (P0) — the scale fix. Queries post-P0 schema.
- **@km/storage/fs-mount** (P1) — @km/fs-mount package + reconciliation
  - @km/storage/reconciliation-harness (P1) — blocking test suite
  - @km/storage/identity-recovery-cascade (P1) — inode→name→composite cascade per §3
  - @km/storage/markdown-fidelity-corpus (P1) — gates writeback
- **@km/storage/writeback-cas** (P1) — corpus → minimal serializer → CAS → echo suppression
- **@km/storage/federation** (P2) — cross-repo URLs, workspace mounts
- **@km/storage/session-state-split** (P2) — ~/.km/session.db

## Phase B+ pathway

- **@km/storage/pathway-db-crdt** (P3 epic) — tracker for Phase B→E pathway
  - @km/storage/op-vocabulary-audit (P0) — gates Phase B cost. Verify TEA apply() ops are serializable + content-scoped before scheduling Phase B.

## Closed

- @km/storage/crdt-trigger (superseded by pathway-db-crdt)
- @km/storage/multi-file-atomicity-decision (decided 2026-04-22: no journal in Phase A; Phase B op log handles atomicity)
- @km/storage/adapter-architecture (superseded by v3 doc — 'adapter' framing dropped in favor of concrete FsMount)
- (many earlier, see bd show children)
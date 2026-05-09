---
aliases:
  - km-storage.sync-architecture.chaos-matrix-reconciler-stale-state-on-rewrite
  - km-storage-sync-architecture-chaos-matrix-reconciler-stale-state-on-rewrite
created_at: 2026-05-09T00:12:00.032Z
tags:
  - P1
  - bug
---

# Reconciler leaves stale link rows + churns node identity on rewrite/rename #bug #P1

Two reconciler defects revealed by chaos-matrix.fuzz.ts at deterministic seed 42 (and most other seeds; tests passed at the original commit only by random-seed luck — see sibling chaos-matrix-deterministic-seeds).

(1) Stale link rows after content rewrite. wikilink target swaps test rewrites a host file 20 times with new wikilink content. After each writeFile + reconcileDirectoryRecursive + applyReconcileOps, the host's outgoing link rows in the links table contain hrefs that no longer appear in the file content (e.g. notes/host2.md → km:alpha when the latest content uses beta/gamma/delta only). The reconciler's apply path is not calling removeLinksFromSource(hostId) before re-extracting from new content. Backlinks on the user's UI would show stale connections to non-existent references.

(2) Node identity churn under rename+change. rename + change matrix test runs 40 mixed add/change/unlink/rename events via createFsEventPicker. Some paths that survive (still on the FS at the end) end up with different file-node ids than they had at the start. The reconciler is treating an unlink+add cycle for an unchanged-content path as a deletion + new file, reissuing an ID. Cross-file backlinks pointing to the old id break.

Both are sync invariants the chaos-matrix matrix is supposed to gate. Acceptance: after pinning seeds (sibling bead lands first), the stale-link case passes — `removeLinksFromSource(hostId)` fires on every re-parse before re-extraction; the rename+change case passes — the reconciler classifies unlink+add same-content sequences as identity-preserving moves, not delete+create. Add invariant assertions to the verifier so any future regression is caught immediately. Code refs: packages/km-fs-mount/src/watch/* (reconciler), packages/km-storage/tests/sync/chaos/chaos-matrix.fuzz.ts:191 (link graph invariant), :128 (node identity invariant).

Acceptance update 2026-05-09: writing a deterministic regression test for either failure (node identity churn, stale link rows) requires a deterministic ULID factory — without one, fuzz seeds pin events but not node IDs. Blocks on @km/test-infra/deterministic-ulid-factory (#chore #P2).


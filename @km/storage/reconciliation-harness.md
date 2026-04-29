---
id: "@km/storage/reconciliation-harness"
aliases:
  - km-storage.reconciliation-harness
  - km-storage-reconciliation-harness
created_by: claude:8b5b9e1c
created_at: 2026-04-22T04:49:52Z
closed_at: 2026-04-22T06:36:50Z
close_reason: "Scaffolding complete: reconcile-cascade.slow.test.ts (6 pass + 4
  skip) + reconcile-cascade.fuzz.ts (split/merge pass, cascade tests skip),
  verifier extended
  (snapshotUlidsByPath/verifyUlidStability/verifyUlidFreshness), transformers
  extended. Skipped tests gated on km-storage.identity-recovery-cascade."
---

# [x] Reconciliation test harness: extend existing chaos+fuzz suite with inode-primary cascade + ULID-stability invariants @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage/fs-mount]]

Extend the existing chaos + fuzz test suite with inode-primary cascade scenarios + ULID-stability invariants. **Not a green-field build** — ~30% new infrastructure, ~70% extending what exists.

## Existing infrastructure to extend
packages/@km/storage/tests/:
- sync/chaos/ — chaos-fuzz.fuzz.ts, content-roundtrip.fuzz.ts, lifecycle-fuzz.fuzz.ts, index-file-chaos.fuzz.ts, concurrent.slow.test.ts, db-to-fs.slow.test.ts
- sync/chaos/fake-fs.ts, fake-repo.ts, fake-watcher.ts — test doubles (already used)
- sync/chaos/verifier.ts, transformers.ts, event-picker.ts — property-test machinery
- watch/ — reconcile.test.ts, node-differ.fuzz.ts, bidirectional-sync.slow.test.ts, storage-bugs.slow.test.ts

## What this bead adds
1. Scenario fixtures for the inode-primary cascade:
   - same-FS rename with inode preserved (inode Step 1 should resolve)
   - cross-FS rename with inode reassigned (falls to .name Step 2)
   - inode reuse after deletion (validation rule in §3.2: disambiguate via path/hash/mtime; tombstone+new if all three disagree)
   - directory rename
   - split-file + merge-file (currently non-goals per §3.3)
2. ULID-stability invariants in the chaos verifier (currently verifies content round-trip; add: 'ULID preserved when reconciliation should preserve it; fresh when it shouldn't')
3. Migrate existing reconcile.test.ts scenarios to assert against §3's new cascade

## Why it blocks fs-mount
Per §8.P2 and pro round-2 review: heuristic classifiers without a test harness are bug farms. The new cascade (inode primary, .name secondary, content-hash+position composite) has enough branches that silent misattribution would go unnoticed without property-based coverage.
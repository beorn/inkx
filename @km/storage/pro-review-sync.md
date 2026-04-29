---
id: "@km/storage/pro-review-sync"
aliases:
  - km-storage.pro-review-sync
  - km-storage-pro-review-sync
created_by: Bjørn Stabell
created_at: 2026-04-01T05:50:39Z
closed_at: 2026-04-02T21:41:04Z
close_reason: "All P0/P1 findings from GPT 5.4 Pro review addressed:
  private-emitter (shared + skipFsSync), recent-writes-timing (WriteTokenMap),
  move-disk (fs.rename + cascade), rename-outside-stream (write tokens +
  journal), ordinal-drift (3-phase matching), diff-empty-guard (removed). Across
  7 phases of km-storage.sync-refactor."
owner: bjorn@stabell.org
assignee: claude:km-work2
---

# [x] Pro Review: km-storage sync pipeline ownership model @km/storage #task #P1 @claude:km-work2

GPT 5.4 Pro code review of @km/storage sync pipeline (2026-03-31). 9 findings: 3 P0, 6 P1. Cost: $6.79.

Focus: Sync ownership model, data loss bugs, bidirectional sync architecture.

## Findings Summary

### P0 — Correctness / Data Loss (3)
1. reconcileIfChanged still called for create/delete/move/task handlers — same data loss pattern as the fixed bug
2. Folder deletion uses unlinkSync which fails on directories (EISDIR)
3. WriteQueue.flush() is re-entrant — can write stale content after newer content

### P1 — Important Safety/Quality (6)
1. SyncManager creates a private emitter instead of sharing the repo's emitter
2. recentWrites anchored to queue time not write time, and many write paths bypass it
3. handleNodeMoved doesn't handle moving file/folder items on disk
4. node-differ structural matching by (parent_id, ordinal, type) causes identity drift
5. Empty-string guard in diffNodeFields is an incorrect self-write detector
6. Inline FS sync in emit() prevents batching and writes intermediate states

### Architecture Recommendation
Per-file ownership state machine: Clean → DirtyLocal → Writing → AwaitingEcho → Clean.
Never reconcile FS→DB into a dirty/active file. Decouple FS sync from emit pipeline.
Use generation + hash instead of timestamp windows.

## Industry Comparison (Key Findings)
- VS Code: Dirty buffer wins. Uses version IDs + file stat, never silently re-imports into dirty buffer.
- Obsidian: Conflict copies/history, never best-effort overwrite of active edit.
- Emacs/Org-roam: Closest match to km. Buffer-modified-p flag. Auto-revert only when clean.
- Logseq: File-first, fragile under sync races — exactly km's current problem.
- Yjs/Automerge: Causal metadata, not mtime. Overkill for km's current needs.

Output: /tmp/llm-manual-gpt-54-pro-deep-5rba.txt
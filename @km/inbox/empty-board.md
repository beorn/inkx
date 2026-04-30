---
id: "@km/inbox/empty-board"
aliases:
  - km-empty-board
  - "@km/_orphan/empty-board"
created_at: 2026-02-03T13:12:42Z
closed_at: 2026-02-03T13:41:35Z
assignee: claude:a9dd3b69
---

# [x] km view shows empty board when .km/state.db has stale partial data @km/_orphan #bug #P1 @claude:a9dd3b69

When running `km view /tmp/tst-vault`, the board is empty despite the vault having 19 top-level entries (files and directories).

## Root cause
The .km/state.db contains 23 nodes from a previous interrupted sync - 1 folder (root) and 22 body nodes (ul/paragraph) from a partially-synced single file. The orphaned .km auto-recovery check (repo.ts:708) only triggers when nodeCount <= 1, so 23 stale nodes bypass it.

## Key issue
The health check counts total nodes but doesn't check if the database actually represents the vault contents. A database with 23 nodes (all body nodes, zero file/folder children of root) should still be detected as incomplete.

## Evidence
- state.db: 23 nodes (1 folder root, 1 paragraph, 21 ul nodes)
- Root node has 0 direct children
- Vault has 19 top-level entries (9 .md files, 5+ directories)
- Auto-recovery threshold (<=1) not reached → disk mode used → empty board

## Fix scope

### 1. Improve health check heuristic (repo.ts:708)
- Check root's direct children count vs filesystem top-level entries
- Check structural node count (file/folder/section) not just total count
- Possible: compare ratio of DB file/folder nodes to actual fs entries

### 2. User-visible error with fix instructions
- When corrupt/incomplete .km is detected, show a clear warning (not just debug log)
- Use toast system (warning level) or stderr message before TUI starts
- Include actionable fix instructions, e.g.:
  - "Database appears incomplete (23 nodes, 0 files indexed). Using memory mode."
  - "To fix permanently: rm -rf .km && km init"
- Currently loadErrors exist on Repo but are NOT surfaced in the view command TUI

### 3. Prevent corruption from interrupted sync
- Make initial sync more atomic (don't leave partial .km state)
- Options: write to temp db then rename, or use a "sync complete" marker file
- If .km/state.db exists but no completion marker → treat as interrupted → auto-recover

### 4. Cleanup for existing corrupt .km
- `km doctor` or `km init --force` command to detect and fix corrupt databases
- Or: auto-delete and re-create .km when corruption detected (with user warning)
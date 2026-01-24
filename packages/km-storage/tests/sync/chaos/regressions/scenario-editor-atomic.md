---
type: chaos-test
beadId: km-sync-m5.0
createdAt: 2026-01-23T23:00:00.000Z
description: Editor atomic writes - temp file rename pattern
invariantsViolated: []
seed: 100002
index: 1
setup:
  - path: document.md
    content: |
      # Document

      Original content here.

      - [ ] Important task
scenarios:
  - type: editor_atomic
    params:
      tempSuffix: ".tmp"
      renameDelayMs: 50
events:
  - type: add
    path: document.md.tmp
    mtime: 1700000001000
  - type: unlink
    path: document.md
    mtime: 1700000001050
  - type: add
    path: document.md
    mtime: 1700000001100
  - type: unlink
    path: document.md.tmp
    mtime: 1700000001150
---

# Editor Atomic Writes

Tests that the sync system correctly handles atomic write patterns used by
editors like Vim, VSCode, and Emacs.

## Trigger Conditions

- Chaos scenario: `editor_atomic`
- File save pattern: write temp → delete original → rename temp → delete temp

## What This Tests

Editors use atomic writes to prevent data loss:
1. Write content to `file.tmp`
2. Delete original `file.md`
3. Rename `file.tmp` to `file.md`
4. (Optional) Delete leftover temp file

This creates a rapid sequence of add/unlink events that must be handled atomically.

## Invariants Verified

- `no_duplicates`: Original file not duplicated during rename
- `fs_db_sync`: Final state matches new file content
- `file_paths`: No orphaned nodes pointing to temp files

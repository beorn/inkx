---
type: chaos-test
beadId: km-sync-m5.0
createdAt: 2026-01-23T23:00:00.000Z
description: Init gap - files changed during watcher initialization
invariantsViolated: []
seed: 100003
index: 2
setup:
  - path: existing.md
    content: |
      # Existing File

      - [ ] Was here before watcher started
scenarios:
  - type: init_gap
    params:
      initDurationMs: 2000
      eventsBeforeReady: 5
events:
  - type: add
    path: new-during-init.md
    mtime: 1700000000500
  - type: change
    path: existing.md
    mtime: 1700000001000
  - type: add
    path: another-new.md
    mtime: 1700000001500
---

# Init Gap Handling

Tests that files created or modified during watcher initialization are
correctly captured when the watcher becomes ready.

## Trigger Conditions

- Chaos scenario: `init_gap`
- Files created between initial scan and watcher ready
- Files modified during initialization period

## What This Tests

Race condition window:
1. Initial directory scan completes
2. Watcher starts but isn't ready yet (2 second gap)
3. Files are created/modified during this window
4. Watcher becomes ready

Files changed during the gap must not be missed or duplicated.

## Invariants Verified

- `fs_db_sync`: All files created during init gap are in database
- `no_duplicates`: Files not scanned twice (once in scan, once from event)
- `parent_integrity`: New files have correct parent references

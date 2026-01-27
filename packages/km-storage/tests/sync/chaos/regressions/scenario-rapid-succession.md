---
type: chaos-test
beadId: km-test-1.0
createdAt: 2026-01-23T23:00:00.000Z
description: Rapid succession - many edits in milliseconds
invariantsViolated: []
seed: 100004
index: 3
setup:
  - path: active-doc.md
    content: |
      # Active Document

      - [ ] Being edited rapidly
scenarios:
  - type: rapid_succession
    params:
      editsPerFile: 10
      intervalMs: 5
events:
  - type: change
    path: active-doc.md
    mtime: 1700000000000
  - type: change
    path: active-doc.md
    mtime: 1700000000005
  - type: change
    path: active-doc.md
    mtime: 1700000000010
  - type: change
    path: active-doc.md
    mtime: 1700000000015
  - type: change
    path: active-doc.md
    mtime: 1700000000020
  - type: change
    path: active-doc.md
    mtime: 1700000000025
  - type: change
    path: active-doc.md
    mtime: 1700000000030
  - type: change
    path: active-doc.md
    mtime: 1700000000035
  - type: change
    path: active-doc.md
    mtime: 1700000000040
  - type: change
    path: active-doc.md
    mtime: 1700000000045
---

# Rapid Succession Events

Tests that the sync system correctly handles rapid-fire edit events
from autosave, search-replace, or fast typing.

## Trigger Conditions

- Chaos scenario: `rapid_succession`
- 10 change events within 50ms
- Same file modified repeatedly

## What This Tests

When users type rapidly with autosave:

1. Multiple change events fire in quick succession
2. Debouncing should coalesce these
3. Only final state should be persisted
4. No intermediate states should cause issues

## Invariants Verified

- `no_duplicates`: File not duplicated despite many events
- `fs_db_sync`: Final content matches last write
- `tree_consistency`: No partial/corrupt tree states

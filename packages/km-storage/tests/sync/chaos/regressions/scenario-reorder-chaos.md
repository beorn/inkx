---
type: chaos-test
beadId: km-sync-m5.0
createdAt: 2026-01-23T23:00:00.000Z
description: Reorder chaos - events delivered out of order
invariantsViolated: []
seed: 100005
index: 4
setup:
  - path: file-a.md
    content: |
      # File A
      - [ ] Task 1
  - path: file-b.md
    content: |
      # File B
      - [ ] Task 2
  - path: file-c.md
    content: |
      # File C
      - [ ] Task 3
scenarios:
  - type: reorder_chaos
    params:
      reorderProbability: 0.5
      maxReorderWindow: 10
events:
  - type: add
    path: file-a.md
    mtime: 1700000000100
  - type: change
    path: file-b.md
    mtime: 1700000000200
  - type: unlink
    path: file-c.md
    mtime: 1700000000300
  - type: add
    path: file-c.md
    mtime: 1700000000400
  - type: change
    path: file-a.md
    mtime: 1700000000500
---

# Event Reordering

Tests that the sync system correctly handles events delivered
in non-deterministic order.

## Trigger Conditions

- Chaos scenario: `reorder_chaos`
- 50% probability of event reordering
- Events within 10-event window may swap

## What This Tests

File system events can arrive out of order:

1. Network filesystems may batch/reorder
2. Multi-threaded watchers have race conditions
3. OS event queues have no ordering guarantees

The sync system must handle any valid event order.

## Invariants Verified

- `fs_db_sync`: Final state matches filesystem regardless of event order
- `no_duplicates`: No duplicates from out-of-order add events
- `parent_integrity`: Parent relationships remain valid

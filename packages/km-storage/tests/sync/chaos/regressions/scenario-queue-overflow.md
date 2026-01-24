---
type: chaos-test
beadId: km-sync-m5.0
createdAt: 2026-01-23T23:00:00.000Z
description: Queue overflow recovery - dropped events don't cause duplicates
invariantsViolated: []
seed: 100001
index: 0
setup:
  - path: tasks.md
    content: |
      # Tasks

      - [ ] Task A
      - [ ] Task B
      - [ ] Task C
  - path: notes/project.md
    content: |
      # Project Notes

      - [ ] Review design
      - [x] Complete draft
scenarios:
  - type: queue_overflow
    params:
      dropRate: 0.3
      burstSize: 30
events:
  - type: change
    path: tasks.md
    mtime: 1700000001000
  - type: change
    path: notes/project.md
    mtime: 1700000002000
  - type: add
    path: tasks.md
    mtime: 1700000003000
  - type: change
    path: tasks.md
    mtime: 1700000004000
---

# Queue Overflow Recovery

Tests that the sync system correctly handles dropped events during queue overflow
without creating duplicate nodes.

## Trigger Conditions

- Chaos scenario: `queue_overflow` with 30% drop rate
- Multiple rapid events on same file
- Events arriving after recovery

## What This Tests

When inotify/FSEvents buffer overflows:

1. Events may be dropped randomly
2. System recovers by re-scanning affected directories
3. Recovery must not create duplicate nodes

## Invariants Verified

- `no_duplicates`: No duplicate nodes for same fs_path after overflow recovery
- `fs_db_sync`: Database matches filesystem after recovery completes

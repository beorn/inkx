---
type: chaos-test
beadId: km-sync-m5.0
createdAt: 2026-01-23T22:00:00.000Z
description: Chaos fuzzer coverage scenarios
invariantsViolated: []
seed: 12345
index: 0
setup:
  - path: inbox.md
    content: |
      # Inbox

      - [ ] Task 1
      - [x] Task 2
      - [ ] Task 3
scenarios:
  - type: queue_overflow
    params:
      dropRate: 0.2
      burstSize: 50
events:
  - type: change
    path: inbox.md
    mtime: 1700000000000
---

# Chaos Fuzzer Coverage Documentation

This document describes the chaos scenarios tested by the sync system fuzzer
and the invariants verified after each scenario.

## Scenarios Tested

| Scenario | Description | Real-World Analog |
|----------|-------------|-------------------|
| `slow_disk` | Events delayed 2-5 seconds | Network drives, busy disks |
| `queue_overflow` | 20% of events dropped randomly | inotify IN_Q_OVERFLOW |
| `editor_atomic` | change → delete + add pair | Vim/VSCode atomic saves |
| `event_storm` | Bursts of 100+ events | npm install, git checkout |
| `reorder_chaos` | Events reordered randomly | Non-deterministic delivery |
| `partial_writes` | File created before fully written | Large file writes |
| `rename_storm` | Rapid file renames | Refactoring tools |
| `fsevents_coalesce` | Parent dir event only | macOS FSEvents coalescing |
| `init_gap` | Changes during watcher init | Files created before ready |
| `rapid_succession` | Many edits in milliseconds | Rapid typing with autosave |

## Invariants Verified

After each chaos scenario, the following invariants are checked:

1. **no_duplicates** - No duplicate nodes for the same fs_path
2. **parent_integrity** - All nodes have valid parent_id references
3. **file_paths** - All file nodes have valid fs_path
4. **fs_db_sync** - Filesystem and database are in sync
5. **tree_consistency** - Node tree is internally consistent

## Test Results

As of 2026-01-23, the chaos fuzzer passes:
- 500 iterations with aggressive parameters
- All 10 chaos scenarios
- Combination of up to 3 scenarios per test
- Files: up to 10, Events: up to 30

This indicates the sync system is robust against the documented edge cases.

## Adding New Regressions

When a bug is found:

1. Record the failing seed: `seed: NNNNNN`
2. Create a bead: `bd create --type=bug --title="..."`
3. Save the scenario to this directory
4. Fix the bug
5. Add `fixedIn: <commit>` to the frontmatter

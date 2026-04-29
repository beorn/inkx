---
id: "@km/_orphan/cli-progress"
aliases:
  - km-cli-progress
created_at: 2026-01-27T09:26:35Z
closed_at: 2026-01-27T09:41:02Z
---

# [x] Add progress reporting to sync operations (CLI and TUI) @km/_orphan #feature #P3 @beorn

## Problem

Sync operations show minimal progress feedback for large vaults.

## Solution Implemented (CLI)

Added `syncFromFsWithProgress()` async generator to SyncManager that yields `SyncProgress` updates.

Updated `km init` and `km sync` to use the generator with `steps()`:
- Shows sub-steps for each phase: scanning → reconciling → rules
- Shows progress within each phase (e.g., "reconciling 25/51")

Example output during sync:
```
⠋ Sync files
  ✓ scanning
  ⠋ reconciling 25/51
```

Files changed:
- packages/@km/storage/src/watch/sync.ts - added syncFromFsWithProgress()
- apps/@km/_orphan/cli/src/commands/init.ts - use generator with steps()
- apps/@km/_orphan/cli/src/commands/sync.ts - use generator with steps()

## TODO: TUI (future work)

The TUI BottomBar still shows basic "sync:N" - could be enhanced to show phase + progress like CLI does. Would need:
1. SyncManager to emit progress events (not just callback/generator)
2. TUI to subscribe and display in BottomBar
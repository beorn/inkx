---
mentions:
  - km
id: "@km/inbox/7cvo"
aliases:
  - km-7cvo
  - "@km/_orphan/7cvo"
created_at: 2026-01-21T15:46:05Z
closed_at: 2026-01-21T16:01:25Z
---

# [x] Run chokidar watcher in a worker thread @km/_orphan #feature #P2

## Problem

Chokidar file watcher blocks the event loop for 20+ seconds on large directories (21k files) during FSEvents setup. Current workaround is `--no-watch` flag, but this disables live sync entirely.

## Proposed Solution

Move chokidar watcher to a Bun/Node worker thread so FSEvents setup doesn't block the main event loop.

## Design Considerations

- Should this be part of a broader "services/daemon" architecture?
- Currently we have:
  - `km daemon` - long-running sync process
  - `SyncManager` in TUI - inline watcher
  - `km watch` CLI - standalone watcher
- Consider unified daemon that:
  - Runs in background
  - Handles file watching
  - Provides IPC for TUI to connect to
  - Avoids duplicate watchers when multiple TUI instances run

## Technical Notes

- Bun has `new Worker()` support
- Worker can post messages when files change
- Main thread stays responsive
- See: https://bun.sh/docs/api/workers

## Related

- @km/_orphan/qcd5: Added --no-watch config option as workaround
- @km/_orphan/lkm5: Original keyboard unresponsiveness issue


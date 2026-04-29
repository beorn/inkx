---
id: "@km/_orphan/bj5g"
aliases:
  - km-bj5g
created_at: 2026-01-21T22:50:36Z
closed_at: 2026-01-21T23:00:10Z
---

# [x] Worker debug logs bypass DEBUG_LOG file redirect @km/_orphan #bug #P2

When running with DEBUG_LOG=/tmp/debug.log, the worker thread's debug output (km:storage:watch:worker) still appears in the CLI instead of going to the file.

Root cause: The worker thread runs in a separate process and has its own debug instance. Even though we forward debug messages to the main thread via postMessage, the worker's localDebug() call still writes directly to stderr.

Current behavior:
- Worker calls localDebug() which goes to stderr (CLI)
- Worker also sends debug message to main thread
- Main thread logs via workerDebug() which respects DEBUG_LOG

Proposed fix:
- In watcher-worker.ts, only call localDebug when DEBUG_LOG is not set
- Or: Remove localDebug entirely and only use postMessage forwarding

Files involved:
- packages/@km/storage/src/watch/watcher-worker.ts (debug function)
- packages/@km/storage/src/watch/worker-watcher.ts (handleWorkerMessage)
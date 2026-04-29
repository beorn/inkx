---
id: "@km/_orphan/nfy3"
aliases:
  - km-nfy3
created_at: 2026-01-21T22:46:38Z
closed_at: 2026-01-22T00:25:54Z
---

# [x] Confusing watch module naming: watcher-worker vs worker-watcher @km/_orphan #task #P3

packages/@km/storage/src/watch/ has confusing file names:
- watcher.ts (main watcher interface)
- watcher-worker.ts (worker thread)
- worker-watcher.ts (worker wrapper/bridge)

The names don't clearly indicate relationships or responsibilities.

Suggested renames:
- watcher.ts → keep
- watcher-worker.ts → worker-thread.ts
- worker-watcher.ts → worker-interface.ts (or worker-bridge.ts)
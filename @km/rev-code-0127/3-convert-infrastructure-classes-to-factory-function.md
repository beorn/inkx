---
mentions:
  - km
id: "@km/rev-code-0127/3-convert-infrastructure-classes-to-factory-function"
aliases:
  - km-rev-code-0127.3
  - km-rev-code-0127-3
  - "@km/rev-code-0127/3"
created_at: 2026-01-27T14:28:37Z
closed_at: 2026-01-27T14:35:27Z
---

# [x] Convert infrastructure classes to factory functions @km/rev-code-0127 #task #P2

**High**: 17 classes violate factory function principle from docs/principles.md

Infrastructure classes to convert:

- SyncManager (packages/@km/storage/src/sync.ts:99)
- WriteQueue (packages/@km/storage/src/writequeue.ts:302)
- FileSystemWatcher (packages/@km/storage/src/watcher.ts:46)
- ParsePool (packages/@km/storage/src/parse-pool.ts:48)
- MemoryStore (packages/@km/storage/src/store.ts:302)
- ToastQueue (packages/@km/_orphan/core/src/toast.ts:56)
- DisposableStore (packages/@km/_orphan/core/src/events.ts:125)

Note: docs/principles.md says "Why not classes" but doesn't explain when infrastructure classes are acceptable.

Actions:

1. Convert classes to factory functions OR
2. Document rationale for infrastructure classes in docs


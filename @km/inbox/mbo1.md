---
id: "@km/inbox/mbo1"
aliases:
  - km-mbo1
  - "@km/_orphan/mbo1"
created_at: 2026-01-16T11:50:31Z
closed_at: 2026-01-16T11:56:56Z
---

# [x] Layer violation: km-cli imports km-watch directly @km/_orphan #bug #P2

**Architecture violation**: @km/_orphan/cli (UI layer) imports @km/_orphan/watch (Sync layer) directly, bypassing @km/_orphan/store (Model layer).

Files affected:
- apps/@km/_orphan/cli/src/commands/sync.ts:9 - `import { SyncManager } from '@km/watch'`
- apps/@km/_orphan/cli/src/commands/daemon.ts:19 - `import { SyncManager } from '@km/watch'`

Expected: UI layer should only call @km/_orphan/store, which coordinates with @km/_orphan/watch.

Fix: Either expose SyncManager through @km/_orphan/store, or accept this as intentional CLI infrastructure.
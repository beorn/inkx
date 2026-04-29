---
id: "@km/tui/startup-memory-12gb"
aliases:
  - km-tui.startup-memory-12gb
  - km-tui-startup-memory-12gb
created_by: Bjørn Stabell
created_at: 2026-04-15T07:44:18Z
---

# [ ] km view allocates 12 GB RSS on startup even for empty vault @km/tui #task #P2

blocks:: [[@km/tui]]

Observed in a Bun panic crash report from 2026-04-15: bun apps/@km/_orphan/cli/src/index.ts view against a vault with 0 files loaded (Load repo (0/0)) still grew the RSS to 12.26 GB with peak 12.39 GB before crashing. Zero files means nothing to materialize — where does the 12 GB come from? Workers_spawned(18) in the crash banner suggests an 18-worker pool is part of it, but each worker shouldn't need 650 MB.

Likely candidates to profile:
- Vitest pool startup (even though this was 'km view' not tests) — maybe we share a worker pool?
- FTS5 index bootstrap — does it pre-allocate for a projected corpus size?
- React reconciler initial cache allocation
- Bun module graph for the full km monorepo on first import

Investigation: run 'bun --heap-snapshot apps/@km/_orphan/cli/src/index.ts view /tmp/empty-vault', analyze the snapshot. Or run with BUN_DEBUG_QUIET_LOGS=0 and profile allocator pressure.

Impact: this is the direct cause of the Bun allocator panic (oven-sh/bun#29338) under concurrent memory pressure — if km's startup allocated 3 GB instead of 12 GB, the allocator race wouldn't be reachable. Not as urgent as a crash, but worth investigating.
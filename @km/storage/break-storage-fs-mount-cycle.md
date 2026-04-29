---
id: "@km/storage/break-storage-fs-mount-cycle"
aliases:
  - km-storage.break-storage-fs-mount-cycle
  - km-storage-break-storage-fs-mount-cycle
created_by: claude:8b5b9e1c
created_at: 2026-04-22T17:11:05Z
closed_at: 2026-04-22T18:43:01Z
close_reason: Shipped option (d) via commit 0bbae47b4. Both packages already
  private=true. Added Known-Constraint sections to storage + fs-mount CLAUDE.md
  + hub/km/storage-architecture.md §6.6. New check-no-publish-private.sh +
  no-publish-private.test.ts (3/3 pass) wired into test:ci. Option (c) — extract
  @km/runtime — remains the long-term fix; tracked as follow-up when publishing
  becomes a goal.
---

# [x] Break @km/storage ↔ @km/fs-mount source-level cycle @km/storage #feature #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]]

Pre-existing structural issue surfaced cleanly after fs-mount re-export deletion (commit 6ecac689b).

## Current state
- @km/fs-mount's package.json declares @km/storage as a dependency (correct — it imports Emitter, getNode, apply(), etc.)
- @km/storage's package.json does NOT declare @km/fs-mount, but @km/storage SOURCE imports from @km/fs-mount in 10 files: change-compaction.ts, watcher.ts, markdown/processing.ts, markdown/collapse-parse.ts, db/queries/smart-resolver.ts, discovery.ts, repo/repo.ts, repo/loader.ts
- Works today via workspace hoisting. Would break if @km/storage were ever published to npm (downstream consumer missing @km/fs-mount transitively).
- Structurally a package-level cycle: storage→fs-mount and fs-mount→storage.

## Why it matters
- The fs-mount extraction's stated goal ('web/canvas-ready @km/storage that doesn't transitively pull node:fs') is blocked by these 10 direct source imports. Even if we replaced them with fs-mount-package imports, the cycle makes the boundary notional.
- 17 legacy @km/storage files ALSO still import 'fs' directly (the fs-mount bead's DO-NOT-MOVE list): store/{base,memory}.ts, repo/*, discovery.ts, config.ts, change-compaction.ts, sibling-order.ts, emitter.ts, federation/*, session/*, markdown/{deferred,resolve-inbound-anchors,parse-worker}, testing/env, db/queries/smart-resolver.ts.

## Options
(a) **Invert the dependency**: migrate Emitter + query helpers that fs-mount needs into @km/fs-mount's dep footprint (e.g. a shared @km/runtime package), so fs-mount → core/runtime, storage → fs-mount. Clean but large refactor.
(b) **Merge the two packages**: accept that the fs-mount split was cosmetic and fold @km/fs-mount back into @km/storage. Undoes fs-mount bead but honest.
(c) **Extract a third package** (e.g. @km/runtime) containing Emitter + the shared query helpers. Both storage and fs-mount depend on it; no cycle. Most ambitious.
(d) **Accept workspace-only + document**: add an explicit package.json comment, forbid publishing either package to npm, add a CI check that enforces 'storage + fs-mount ship or neither does'.

Recommend option (c) for correctness, option (d) as a pragmatic stopgap. User to decide.

## /complete
- Either the cycle is broken (package A depends on B but not vice versa in source AND package.json) OR option (d) is implemented with explicit package.json statement + CI gate
- grep @km/fs-mount packages/@km/storage/src --include=*.ts shows 0 hits (if option a/c) OR matches a documented allowlist (if option d)
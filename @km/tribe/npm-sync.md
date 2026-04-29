---
id: "@km/tribe/npm-sync"
aliases:
  - km-tribe.npm-sync
  - km-tribe-npm-sync
created_by: claude:19080504
created_at: 2026-03-26T16:59:03Z
closed_at: 2026-03-26T17:02:01Z
close_reason: "Fixed: prepublishOnly bundles tools/tribe.ts into
  plugins/tribe/server.ts. Published as @bearly/tribe@0.3.1."
---

# [x] Published tribe server.ts is stale @km/tribe #bug #P2

plugins/tribe/server.ts is a stale standalone copy (795 lines) vs tools/tribe.ts (1140 lines). Missing: plugin system, noise dedup, auto-reload, prune-rename, cursor recovery, message format rules. Need to bundle deps (tribe-retro.ts, lib/tribe/plugins.ts) into the npm package or inline them.
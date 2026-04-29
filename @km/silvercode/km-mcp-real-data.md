---
id: "@km/silvercode/km-mcp-real-data"
aliases:
  - km-silvercode.km-mcp-real-data
  - km-silvercode-km-mcp-real-data
created_by: claude:0940ca20
created_at: 2026-04-24T15:33:24Z
closed_at: 2026-04-24T15:39:18Z
close_reason: Shipped in 2dc580625 + 0a5fe70c8 (km-mcp real @km/storage wiring)
  and ca2c10aed (live --mcp-config integration test). 38 passed + 1
  TEST_LIVE-gated skip; 0 type errors.
---

# [x] km-mcp: wire real @km/storage queries (currently emptyContext) @km/silvercode #task #P2 @claude:0940ca20

blocks:: [[@km/silvercode]]

@km/_orphan/mcp-server/src/bin.ts currently uses an emptyContext — all tool calls return empty. Wire the real @km/storage db queries (search, getNode, getTopLevelNodes, renderPath). Requires (a) resolving the km vault path at startup (env var + fallback to cwd's .km/state.db), (b) opening the SQLite db read-only, (c) injecting the query fns into createKmContextFromStorage, (d) clean shutdown on SIGTERM. Spec: apps/silvercode/packages/@km/_orphan/mcp-server/src/adapter.ts already has the adapter shape — just needs the concrete queries wired in the bin.
---
mentions:
  - km
  - claude
id: "@km/silvercode/mcp-integration-test"
aliases:
  - km-silvercode.mcp-integration-test
  - km-silvercode-mcp-integration-test
created_by: claude:0940ca20
created_at: 2026-04-24T15:33:39Z
closed_at: 2026-04-24T15:39:18Z
close_reason: Shipped in 2dc580625 + 0a5fe70c8 (km-mcp real @km/storage wiring)
  and ca2c10aed (live --mcp-config integration test). 38 passed + 1
  TEST_LIVE-gated skip; 0 type errors.
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.mcp-integration-test
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T08:33:39Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] MCP end-to-end integration test: spawn claude, call km_search, verify data path @km/silvercode #task #P3 @claude:0940ca20

blocks:: [[@km/silvercode]]

Spawn claude via spawnClaude with mcpServers, send a user prompt that forces a km_search call, verify the tool_result event reaches the session store. Guards against future regressions where the --mcp-config path gets broken or --strict-mcp-config is dropped. Skips on CI (needs real claude binary); runs on developer machines with 'TEST_LIVE=1'.


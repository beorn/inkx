---
id: "@km/silvercode/m0-harness-skeleton"
aliases:
  - km-silvercode.m0-harness-skeleton
  - km-silvercode-m0-harness-skeleton
created_by: claude:0940ca20
created_at: 2026-04-24T09:08:53Z
closed_at: 2026-04-24T09:36:22Z
close_reason: "Shipped in commit 48955bf47. Live dogfood: bun
  apps/silvercode/tests/live-spawn.ts ran 2-turn conversation with Read
  tool_use, cost $0.0329. 25 tests passing (9 parser + 6 silvercode + 5 km-mcp +
  5 tribe)."
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.m0-harness-skeleton
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T02:09:31Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] M0: @silvery/agent-harness skeleton + spawn @km/silvercode #task #P1 @claude:0940ca20

blocks:: [[@km/silvercode]]

Build the agent-harness package skeleton with spawn.ts (subprocess spawn of claude --bare -p), parse.ts (stream-json parser), events.ts (typed event schemas), and index.ts (public API).
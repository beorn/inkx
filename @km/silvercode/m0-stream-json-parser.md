---
id: "@km/silvercode/m0-stream-json-parser"
aliases:
  - km-silvercode.m0-stream-json-parser
  - km-silvercode-m0-stream-json-parser
created_by: claude:0940ca20
created_at: 2026-04-24T09:09:24Z
closed_at: 2026-04-24T09:36:22Z
close_reason: "Shipped in commit 48955bf47. Live dogfood: bun
  apps/silvercode/tests/live-spawn.ts ran 2-turn conversation with Read
  tool_use, cost $0.0329. 25 tests passing (9 parser + 6 silvercode + 5 km-mcp +
  5 tribe)."
---

# [x] M0: stream-json parser @km/silvercode #task #P1 @claude:0940ca20

blocks:: [[@km/silvercode]]

Parse newline-delimited JSON events from claude --bare -p stdout. Handle turn-start, text-delta, tool-use, tool-result, permission-request, turn-end, session-end, error events.
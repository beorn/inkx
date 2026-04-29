---
id: "@km/silvercode/m0-first-session-card"
aliases:
  - km-silvercode.m0-first-session-card
  - km-silvercode-m0-first-session-card
created_by: claude:0940ca20
created_at: 2026-04-24T09:09:24Z
closed_at: 2026-04-24T09:36:22Z
close_reason: "Shipped in commit 48955bf47. Live dogfood: bun
  apps/silvercode/tests/live-spawn.ts ran 2-turn conversation with Read
  tool_use, cost $0.0329. 25 tests passing (9 parser + 6 silvercode + 5 km-mcp +
  5 tribe)."
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.m0-first-session-card
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T02:09:32Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] M0: trivial silvercode app @km/silvercode #task #P1 @claude:0940ca20

blocks:: [[@km/silvercode]]

apps/silvercode/ with one SessionCard + MessageList + TextInput. Renders user/assistant turns, tool blocks unstyled (JSON.stringify). Launchable via 'bun silvercode'.
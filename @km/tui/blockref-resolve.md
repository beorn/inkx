---
id: "@km/tui/blockref-resolve"
aliases:
  - km-tui.blockref-resolve
  - km-tui-blockref-resolve
created_by: claude:4a5961be
created_at: 2026-03-16T23:47:01Z
closed_at: 2026-04-28T02:33:16Z
close_reason: "Test passes — apps/km-tui/tests/blockref-resolve.test.ts (7
  tests) all green including 'full board: [[^nodeId]] resolves to target title'.
  Bug resolved by prior fixes."
owner: bjorn@stabell.org
---

# [x] blockref-resolve test: full board [[^nodeId]] resolution fails @km/tui #bug #P3

Pre-existing: blockref-resolve.test.ts:81 'full board: [[^nodeId]] resolves to target title' — the rendered text contains the raw node ID instead of the resolved title. The blockref hyperlink is generated but the display text isn't resolved during board rendering.
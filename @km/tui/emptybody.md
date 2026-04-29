---
id: "@km/tui/emptybody"
aliases:
  - km-tui.emptybody
  - km-tui-emptybody
created_at: 2026-02-04T11:27:20Z
closed_at: 2026-02-04T12:39:01Z
assignee: claude:a7826e85
---

# [x] Empty body column shows with raw ID as title @km/tui #bug #P2 @claude:a7826e85

When viewing docs/principles.md, the first column appears empty but shows a raw node ID (like '01KG8Q2S') as its title. Issues:
1. Empty body columns should be hidden entirely
2. If shown, body columns should not display raw IDs as titles
3. The ID display looks confusing/broken to users
---
id: "@km/_orphan/tui-emptybody"
aliases:
  - km-tui-emptybody
created_at: 2026-01-30T16:32:51Z
closed_at: 2026-02-04T11:27:20Z
---

# [x] Empty body column shows with raw ID as title @km/_orphan #bug #P2

When viewing docs/principles.md, the first column appears empty but shows a raw node ID (like '01KG8Q2S') as its title. Issues:
1. Empty body columns should be hidden entirely
2. If shown, body columns should not display raw IDs as titles
3. The ID display looks confusing/broken to users
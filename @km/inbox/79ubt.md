---
id: "@km/inbox/79ubt"
aliases:
  - km-79ubt
  - "@km/_orphan/79ubt"
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:24Z
closed_at: 2026-03-23T22:21:22Z
close_reason: "Done: 22 examples moved to apps/, 7 new component-tier examples
  in components/"
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Split examples: component-tier (no TEA) and app-tier (with TEA) @km/_orphan #task #P1 @claude:fed8de9e

22/24 interactive examples use createApp+store. Create component-tier examples using run()+useState for every @silvery/ui component. Move current examples to app-tier section. Component examples ship with silvery, app examples ship with @silvery/tea.
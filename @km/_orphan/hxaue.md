---
id: "@km/_orphan/hxaue"
aliases:
  - km-hxaue
created_by: claude:124bfbe5
created_at: 2026-02-12T21:36:23Z
closed_at: 2026-02-12T22:28:38Z
---

# [x] TUI: Sigil links colored by resolved node, not dimmed @km/_orphan #feature #P3

When rendering text with sigil links (@foo, #bar):
- Don't style differently (currently dimmed) unless the link resolves to a real node
- If it resolves, show using the color of the resolved node type
Currently all sigil links are dimmed regardless of resolution status.
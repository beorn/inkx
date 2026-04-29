---
id: "@km/_orphan/cafo"
aliases:
  - km-cafo
created_at: 2026-01-21T11:40:42Z
closed_at: 2026-01-21T11:59:07Z
---

# [x] Review navigation architecture and DRY opportunities @km/_orphan #task #P2

Review the docs and the navigation system we've implemented. Identify:
- Opportunities to simplify and make the system clearer
- DRY violations that could be consolidated
- Areas that could be more robust
- Consider how the 4 board views share navigation logic

Focus areas:
- visualToStructural and how it's used in Board.tsx
- board-reducer cursor handling
- Cross-column navigation
- Zoom interactions
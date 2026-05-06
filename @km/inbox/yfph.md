---
mentions:
  - km
id: "@km/inbox/yfph"
aliases:
  - km-yfph
  - "@km/_orphan/yfph"
created_at: 2026-01-16T12:13:00Z
closed_at: 2026-01-17T00:08:46Z
---

# [x] Board.tsx is 2804 lines - needs decomposition @km/_orphan #task #P2

apps/@km/_orphan/cli/src/tui/views/Board.tsx has grown to 2804 lines, making it difficult to maintain and understand.

Suggested decomposition:

- Extract column rendering logic
- Extract card rendering logic
- Extract keyboard handlers
- Extract drag-and-drop logic
- Extract selection logic


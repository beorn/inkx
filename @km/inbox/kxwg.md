---
id: "@km/inbox/kxwg"
aliases:
  - km-kxwg
  - "@km/_orphan/kxwg"
created_at: 2026-01-21T11:37:27Z
closed_at: 2026-01-21T11:40:34Z
---

# [x] Create comprehensive cursor navigation tests @km/_orphan #task #P1

We have many cursor navigation bugs that could have been caught earlier with comprehensive tests. Need to create tests covering all cursor navigation scenarios including:
- All cursor depths (board, column, card, sub-card)
- All directions (up, down, left, right)
- Edge cases (first/last column, first/last card, empty columns)
- Zoom interactions (cursor after zoom in/out)
- Cross-column navigation preserving depth
- Board-level cursor state (no column active)
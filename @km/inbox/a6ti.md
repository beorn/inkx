---
id: "@km/_orphan/a6ti"
aliases:
  - km-a6ti
created_at: 2026-01-22T18:45:58Z
closed_at: 2026-01-22T20:25:55Z
---

# [x] useLayout() in Card components causes blank screen with large datasets @km/_orphan #bug #P0

## Problem
Calling useLayout() in every Card component causes blank screen rendering when viewing boards with 100+ cards.

## Solution
Use visual coordinate-based navigation for ALL cross-container movement:

### Bounding Boxes (per card)
- **Head box**: Bullet + title line (1 terminal row)
- **Card box**: Full card with border + head + visible subitems

### Visual Navigation Rules

**h/l (cross-column cursor):**
- curswantY = vertical midpoint of current card's head
- Find card in target column whose card box intersects curswantY (or closest)

**Alt+h/l (cross-column shift):**
- Find insertion slot in target column closest to curswantY
- Slots exist: after header, between each card, after last card

**j/k at column/board boundary:**
- curswantX = column index when moving up to board level
- Return to curswantX column when moving down from board

**j/k within column:**
- Simple prev/next card movement

**Alt+j/k (shift within column):**
- Reorder card up/down in same column

### Clear Conditions
- curswantY cleared by: j/k, zoom, explicit navigation
- curswantX cleared by: h/l at board level, entering a card, explicit navigation

### Implementation
Calculate card heights from data model (no useLayout needed):
- Head height = 1 row
- Card height = 2 (border) + 1 (head) + visible_subitems

## Files
- apps/@km/tui/packages/@km/_orphan/ink/src/board-actions.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/views/CardColumn.tsx
- apps/@km/tui/packages/@km/_orphan/ink/src/card-positions.ts
- docs/06-ui.md
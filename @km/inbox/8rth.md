---
id: "@km/inbox/8rth"
aliases:
  - km-8rth
  - "@km/_orphan/8rth"
created_at: 2026-01-20T15:55:00Z
closed_at: 2026-01-20T16:00:39Z
---

# [x] View mode shows '[...' when columns/board selected @km/_orphan #bug #P2

## Problem
When columns and board are selected (cursor on column/board header), the view mode indicator doesn't show but instead says "[..."

## Reproduction
1. Open km TUI
2. Navigate cursor to column or board header
3. Look at view mode indicator in bottom bar
4. Shows "[..." instead of view mode

## Expected
View mode should always show correctly.
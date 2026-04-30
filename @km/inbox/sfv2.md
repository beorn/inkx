---
id: "@km/inbox/sfv2"
aliases:
  - km-sfv2
  - "@km/_orphan/sfv2"
created_at: 2026-01-20T15:54:59Z
closed_at: 2026-01-22T10:05:45Z
---

# [x] All views: View doesn't scroll to show cursor when moving off screen @km/_orphan #bug #P1

## Problem
When navigating with cursor keys, the view doesn't scroll to keep the cursor visible when it moves off screen.

## Merged Issues
- @km/_orphan/d1ao: ColumnsView doesn't scroll horizontally to show right-most column

## Scope
- Vertical scrolling in all views (list, cards, columns)
- Horizontal scrolling in columns view

## Expected
View should automatically scroll (both horizontally and vertically as needed) to keep the cursor visible.
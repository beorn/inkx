---
mentions:
  - km
id: "@km/inbox/d1ao"
aliases:
  - km-d1ao
  - "@km/_orphan/d1ao"
created_at: 2026-01-20T15:54:59Z
closed_at: 2026-01-20T20:48:31Z
---

# [x] ColumnsView: View doesn't scroll horizontally to show right-most column @km/_orphan #bug #P2

## Problem

In columns view, when selecting items in the right-most column, the view doesn't scroll horizontally to show that column.

## Reproduction

1. Open km TUI with a board that has many columns
2. Navigate to the right-most column
3. Column can be selected but isn't visible

## Expected

View should scroll horizontally to show the selected column.


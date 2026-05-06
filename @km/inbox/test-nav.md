---
mentions:
  - km
  - beorn
id: "@km/inbox/test-nav"
aliases:
  - km-test-nav
  - "@km/_orphan/test-nav"
created_at: 2026-01-25T03:11:59Z
closed_at: 2026-01-26T16:42:38Z
assignee: beorn
---

# [x] Fix board navigation test failures in board.spec.ts @km/_orphan #bug #P1 @beorn

## Problem

board.spec.ts has 82 todo tests and 4 failing tests. These are acceptance tests that define expected navigation behavior but the implementation doesn't fully support them yet.

## Failing Tests

1. Cursor navigation from cards to column headers (k key from first card)
2. Horizontal navigation at header level
3. curswantY tests for vertical position memory

## Root Cause

Tests expect:

- Pressing 'k' from first card moves cursor to column header
- Column headers use data-cursor attribute (currently use data-selected)
- Full navigation hierarchy: board title → column headers → cards

## Solution

1. Implement missing navigation: card → column header → board title
2. Make column headers use data-cursor (or update selector logic)
3. Verify curswantX/curswantY position memory works
4. Remove .todo() from passing tests

## Files

- apps/@km/tui/tests/board.spec.ts (test definitions)
- apps/@km/tui/src/ui-reducer.ts (navigation logic)
- apps/@km/tui/src/views/CardColumn.tsx (column data-cursor)
- packages/@km/_orphan/commands/src/commands/navigation.ts (command defs)


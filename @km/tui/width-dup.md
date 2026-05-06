---
mentions:
  - km
  - claude
id: "@km/tui/width-dup"
aliases:
  - km-tui.width-dup
  - km-tui-width-dup
created_at: 2026-02-04T11:27:22Z
closed_at: 2026-02-04T13:26:57Z
assignee: claude:27f1a547
---

# [x] ColumnsView: Duplicated width calculations with Board.tsx @km/tui #task #P3 @claude:27f1a547

## Problem

Column width calculation is duplicated between Board.tsx and ColumnsView.tsx with subtle differences:

- Board.tsx: includes maxColWidth constraint
- ColumnsView.tsx: maxColWidth = 50 hardcoded
- Different indicatorWidth calculations

## Impact

Maintenance burden and potential for inconsistent rendering between view modes.

## Location

- Board.tsx lines 256-279 (cards view)
- ColumnsView.tsx lines 226-252 (columns view)

## Fix

Extract shared width calculation to a utility function.


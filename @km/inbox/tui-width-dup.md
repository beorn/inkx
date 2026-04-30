---
id: "@km/inbox/tui-width-dup"
aliases:
  - km-tui-width-dup
  - "@km/_orphan/tui-width-dup"
created_at: 2026-02-02T20:43:11Z
closed_at: 2026-02-04T11:27:22Z
---

# [x] ColumnsView: Duplicated width calculations with Board.tsx @km/_orphan #task #P3

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
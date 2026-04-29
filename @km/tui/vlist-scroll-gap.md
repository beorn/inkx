---
id: "@km/tui/vlist-scroll-gap"
aliases:
  - km-tui.vlist-scroll-gap
  - km-tui-vlist-scroll-gap
created_by: claude:f8196c1c
created_at: 2026-03-28T15:21:08Z
closed_at: 2026-03-28T15:49:38Z
close_reason: itemHeight 3→4, overscan 2→5. Band-aid — real fix is
  km-silvery.vlist-variable-height (variable measurement).
---

# [x] VirtualList scroll gap: blank space at top when scrolling in tall terminal @km/tui #bug #P2

## Bug
On tall terminals (60+ rows), scrolling down through a long Inbox column with 'j' causes blank space to appear at the top of the column. After ~20-30 j presses, the top 3+ rows below the column header are empty — cards that should be visible aren't rendered.

## Root cause (suspected)
CardColumn uses VirtualList with fixed itemHeight=3. Cards with long titles (filenames) render as 4-5 lines. The virtualizer's scroll offset calculation assumes itemHeight=3, so it computes start/end indices that don't cover the full viewport when actual heights exceed the estimate.

## Repro
1. km view ~/Bear/Vault/@next (or any board with 30+ cards in a column)
2. Terminal height 60 rows
3. Press j repeatedly until scrolling starts
4. Observe: gap appears at top of column, grows as you scroll further

## Also observed
Stray border characters (╮ ╯) bleeding into adjacent columns — likely related to the same height mismatch causing misaligned incremental rendering.

## Possible fixes
- Use variable itemHeight via useContentRect (silvery measures actual heights)
- Increase overscan to compensate for height estimation errors
- Use itemHeight=1 with proper scroll tracking (was tried and reverted)
- Dynamic itemHeight based on content length heuristic
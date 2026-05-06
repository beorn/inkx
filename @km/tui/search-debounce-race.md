---
mentions:
  - km
  - Bjørn
id: "@km/tui/search-debounce-race"
aliases:
  - km-tui.search-debounce-race
  - km-tui-search-debounce-race
created_by: Bjørn Stabell
created_at: 2026-04-06T20:46:35Z
closed_at: 2026-04-07T05:56:49Z
close_reason: Fixed via 3e1104cbe. handleLocalFindConfirm() now reads live query
  from activeEditTargetRef.current.getContent(), recomputes matches via
  findMatchingNodeIds(ctx.tree, liveQuery), and commits fresh state before
  flipping isInputActive. Regression test 'Enter before debounce flushes pending
  query' passes. 19/19 local-find tests green.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Search Enter before 150ms shows No matches @km/tui #bug #P1 @Bjørn Stabell

Repro: /, type fast query, Enter before debounce. LOCAL_FIND_CONFIRM doesn't flush debounce. Empty query → no matches. Fix: flush debounce timer in LOCAL_FIND_CONFIRM handler.


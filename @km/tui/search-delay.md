---
mentions:
  - km
  - claude
id: "@km/tui/search-delay"
aliases:
  - km-tui.search-delay
  - km-tui-search-delay
created_at: 2026-02-04T14:00:26Z
closed_at: 2026-02-04T14:17:06Z
assignee: claude:44a381e0
---

# [x] Search dialog has input delay - keypresses eaten before dialog opens @km/tui #bug #P2 @claude:44a381e0

## Problem

When pressing `/` to open search, there's a noticeable delay before the dialog appears. Any keystrokes typed during this delay are lost/eaten, forcing users to wait before they can start typing their search query.

## Expected Behavior

Search dialog should open instantly (or near-instantly) so users can immediately start typing their search query in a fluid motion: `/china<Enter>` should work without pause.

## Actual Behavior

- Press `/`
- Delay of ~200-500ms before dialog appears
- Keypresses during delay are lost
- User must wait, then retype

## Impact

Breaks the fast keyboard-driven workflow. Users expect `/search<Enter>` to be a single fluid gesture.

## Potential Causes

1. React render cycle delay
2. Heavy `rawQuery(SELECT * FROM nodes)` on dialog mount
3. `useMemo` computation for initial results
4. Multiple re-renders during dialog setup

## Investigation

- Check if query can be deferred until after first render
- Consider showing dialog skeleton immediately, populate results async
- Profile render time with React DevTools


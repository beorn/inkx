---
id: "@km/tui/z-slow"
aliases:
  - km-tui.z-slow
  - km-tui-z-slow
created_by: claude:d3a7049b
created_at: 2026-02-22T07:33:59Z
closed_at: 2026-02-22T08:19:54Z
---

# [x] Z (go to root) hangs — slow render, needs loading indicator @km/tui #bug #P0

## Problem

When pressing Z to navigate back to the root of the board, the app hangs for a significant time. The user experiences an unresponsive UI.

## Two issues

1. **Performance**: Something is very slow when navigating to root. Need to profile what's happening (re-render of all nodes? tree rebuild? unfold all?).
2. **Responsiveness**: Even if we can't make it faster, show a loading indicator / skeleton / progressive render so the app doesn't appear frozen.

## Repro

1. Open a board with many nodes
2. Navigate deep into the tree
3. Press Z to go to root
4. Observe hang

## Expected

Either fast navigation, or a loading indicator while the board re-renders.
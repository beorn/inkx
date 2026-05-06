---
mentions:
  - km
  - claude
id: "@km/tui/startup-gap"
aliases:
  - km-tui.startup-gap
  - km-tui-startup-gap
created_by: claude:97b8de73
created_at: 2026-02-23T00:54:21Z
closed_at: 2026-02-23T01:20:37Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Significant pause before board appears after progress steps complete @km/tui #bug #P2 @claude:97b8de73

After the three loadRepo/build-state progress steps complete, there's a visible pause before the board renders. User sees this even with in-memory DB (no disk I/O).

The gap is between:

- initBoardStateGenerator completing (last progress message clears)
- React mounting and rendering the board

Likely causes in the gap:

1. createBoardAppStoreState setup (zustand store creation, undo system setup)
2. React first render (mounting all components, useColumns deriving, TreeNode recursion)
3. inkx layout computation (first frame layout for all visible cards)

Should show a progress indicator (spinner or 'Rendering...') during this phase.
Related to the plan item 'Progress Indicator for Startup Gap'.


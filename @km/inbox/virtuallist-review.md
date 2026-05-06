---
mentions:
  - km
  - claude
id: "@km/inbox/virtuallist-review"
aliases:
  - km-virtuallist-review
  - "@km/_orphan/virtuallist-review"
created_at: 2026-02-02T20:42:17Z
closed_at: 2026-02-02T22:18:39Z
assignee: claude:1588825b
---

# [x] VirtualList/ColumnsView scroll and state management issues @km/_orphan #task #P1 @claude:1588825b

Tracking bead for code review findings in VirtualList and ColumnsView components.

## Summary

Code review identified 24 issues across inkx VirtualList and @km/tui ColumnsView. Key problems:

- Scroll state not preserved for non-selected columns
- Race conditions between prop-based and imperative scrolling
- Performance issues from unnecessary re-renders
- Missing bounds checks

## Child Beads

See linked beads for individual issues.

## Root Cause of Current Bug

When navigating in one column, other columns get scrollTo=undefined which was resetting their scroll state instead of preserving it. Initial fix applied in VirtualList.tsx.


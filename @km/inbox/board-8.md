---
id: "@km/inbox/board-8"
aliases:
  - km-board-8
  - "@km/_orphan/board-8"
created_at: 2026-01-19T15:26:57Z
closed_at: 2026-02-04T11:27:23Z
---

# [x] Invest in TUI testing DX (storybook, visual regression, state inspection) @km/_orphan #epic #P3

**Strategic insight from Decker comparison:**

The most valuable thing from Decker isn't any specific pattern—it's the rapid iteration cycle. KM TUI's biggest friction is the terminal development experience.

## Specific improvements worth considering:

1. **Better snapshot testing** - Extend ink-testing-library with visual diff testing using ANSI-aware comparison

2. **Interactive storybook** - Make tests/storybook.tsx interactive with keyboard nav and state inspection

3. **State inspector** - Debug mode showing current BoardState, UIState, nodeMap in a side panel (dev only)

4. **Soft reload** - Rerun with saved state for faster iteration

## What won't help:
- Web-based preview (loses terminal-specific behavior)
- React DevTools (Ink doesn't use React DOM)

This would provide more value than adopting Decker's patterns.
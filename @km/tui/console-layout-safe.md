---
id: "@km/tui/console-layout-safe"
aliases:
  - km-tui.console-layout-safe
  - km-tui-console-layout-safe
created_by: claude:b509d761
created_at: 2026-02-11T10:18:15Z
closed_at: 2026-02-12T14:25:04Z
---

# [x] Console component: fixed height to prevent layout cascades from debug output @km/tui #task #P3 @claude:586bad48

The Console component dynamically grows as it receives messages, which is a layout-affecting change. Every new console message potentially causes the entire board to relayout (flexGrow sibling shrinks). Fix: Console should use fixed height (e.g. overflow:scroll with fixed allocation) so debug output doesn't cause layout cascades in the board content area. Alternative: Console could be absolutely positioned or use a separate render pass. This is a defense-in-depth measure — even if log-file-only mode suppresses most console output, the Console should be layout-safe for interactive use.
---
id: "@km/tui/command-feedback"
aliases:
  - km-tui.command-feedback
  - km-tui-command-feedback
created_by: Bjørn Stabell
created_at: 2026-04-05T18:22:39Z
closed_at: 2026-04-05T18:32:54Z
close_reason: Status toasts added for fold/unfold, collapse, zoom in/out, toggle
  hidden. Committed a36bd152.
---

# [x] [feat] UI feedback for all view-changing commands (fold, collapse, filter, etc.) @km/tui #feature #P2

All commands that significantly affect the content or view should show 
brief status feedback. Currently:
- Content lines change: shows feedback ✓
- Fold level changes: no feedback ✗
- Collapse toggle: no feedback ✗
- Filter toggle: no feedback ✗
- Hidden toggle: no feedback ✗
- Zoom: no feedback ✗

Pattern: brief toast or status bar flash showing the action + current state.
E.g., "Fold depth: 2", "Column collapsed", "Filter: done hidden", "Zoom: /path".
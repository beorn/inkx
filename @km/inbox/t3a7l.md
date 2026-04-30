---
id: "@km/inbox/t3a7l"
aliases:
  - km-t3a7l
  - "@km/_orphan/t3a7l"
created_by: claude:66437c43
created_at: 2026-03-02T09:45:29Z
closed_at: 2026-03-02T09:45:35Z
owner: bjorn@stabell.org
---

# [x] Bottom bar disappears when detail pane is open @km/_orphan #bug #P2

WorkspaceView's outer Box used flexGrow={1} without overflow='hidden', so Board's explicit height={termHeight} (full terminal height on first render) propagated as min-content-size through intermediate flex containers, preventing the flex container from shrinking WorkspaceView below Board's requested height. The bottom bar (height=1, flexShrink=0) got pushed off screen.

Fix: Add overflow='hidden' to WorkspaceView's outer Box so its min-main-size becomes 0, allowing flex shrinking.
---
id: "@km/silvery/scrollback-wrapper"
aliases:
  - km-silvery.scrollback-wrapper
  - km-silvery-scrollback-wrapper
created_by: claude:def7f8a1
created_at: 2026-03-17T07:13:25Z
closed_at: 2026-03-17T15:35:09Z
close_reason: "ListView has history/surfaceId/textAdapter props. Panes demo
  verified: split panes, virtual history (frozen items), Tab focus, Ctrl+F
  search, Esc close. 110 tests pass. Era2 integration tracked in
  km-silvery.virtual-terminal."
---

# [x] ScrollbackView wrapper + showcase demo @km/silvery #task #P2 @claude:def7f8a1

Phase 5: tmux-style pane demo showcasing ListView + SearchProvider + SplitView. Two AI chat panes with virtual history, tab-to-switch focus, Ctrl+F searches focused pane. Reuses aichat script data and ExchangeItem components. ScrollbackView as thin wrapper over ListView.
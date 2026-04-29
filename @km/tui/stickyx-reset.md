---
id: "@km/tui/stickyx-reset"
aliases:
  - km-tui.stickyx-reset
  - km-tui-stickyx-reset
created_by: claude:a5c7f7de
created_at: 2026-02-15T07:55:44Z
closed_at: 2026-02-15T08:13:16Z
---

# [x] stickyX should also reset on out-of-bounds navigation @km/tui #bug #P2 @claude:a5c7f7de

Like stickyY, stickyX should reset when cursor navigation hits a boundary. Both stickyX and stickyY should be cleared on failed navigation actions.
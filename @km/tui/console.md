---
id: "@km/tui/console"
aliases:
  - km-tui.console
  - km-tui-console
created_at: 2026-02-06T16:31:51Z
closed_at: 2026-02-06T21:12:37Z
---

# [x] Backtick console toggle broken in L3 createApp @km/tui #bug #P2

Pressing backtick to toggle console screen doesn't work. Root cause: L3 createApp (create-app.tsx) captures pause/resume as undefined in the AppContext value object (line 565) before they're assigned (lines 607-616). The object literal { exit, pause, resume } captures VALUES at creation time, so components calling useApp() get { pause: undefined, resume: undefined }. Board.tsx line 563 early-returns when \!onPauseRender || \!onResumeRender. Fix: use a mutable ref object for AppContext value, or assign pause/resume before creating wrappedElement.
---
id: "@km/tui/ctrlw-quit"
aliases:
  - km-tui.ctrlw-quit
  - km-tui-ctrlw-quit
created_by: claude:28b14b32
created_at: 2026-02-23T17:01:30Z
closed_at: 2026-02-24T18:05:50Z
owner: bjorn@stabell.org
---

# [x] Ctrl+w q quits app instead of closing pane @km/tui #bug #P2

User reports Ctrl+w q closes the app. The chord system test passes (processInkKey correctly resolves Ctrl+w → pending → q → pane_close). closeFocusedPane() correctly returns state unchanged for 1 pane. Needs live debugging to determine where the disconnect is — possibly Ghostty intercepts Ctrl+w, or the chord state is being reset between events.
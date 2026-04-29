---
id: "@km/inkx/bracketed-paste"
aliases:
  - km-inkx.bracketed-paste
  - km-inkx-bracketed-paste
created_by: claude:ee8efc0f
created_at: 2026-02-23T00:03:26Z
closed_at: 2026-02-23T00:28:59Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Bracketed paste mode (ESC[?2004h) @km/inkx #feature #P2 @claude:ee8efc0f

Enable bracketed paste by default when reading input. Wraps pasted text with markers so the app receives it as a single event instead of individual keystrokes. BubbleTea enables this by default since v0.26.0. Prevents pasted multi-line text from triggering commands. Simple on/off escape sequence on startup/shutdown.
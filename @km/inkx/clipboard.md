---
id: "@km/inkx/clipboard"
aliases:
  - km-inkx.clipboard
  - km-inkx-clipboard
created_by: claude:ee8efc0f
created_at: 2026-02-23T00:03:20Z
closed_at: 2026-02-23T00:28:59Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] OSC 52 clipboard integration: copy/paste across SSH @km/inkx #feature #P2 @claude:ee8efc0f

Add clipboard support via OSC 52 protocol. Base64-encode text and emit ESC]52;c;{data}\x07 to copy to system clipboard. Works across SSH sessions — huge UX win for remote terminals. BubbleTea v2 added this via terminfo 'Ms' capability. Should expose a copyToClipboard(text) utility and optionally a useClipboard() hook.
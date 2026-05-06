---
mentions:
  - km
  - claude
id: "@km/silvery/strict-terminal"
aliases:
  - km-silvery.strict-terminal
  - km-silvery-strict-terminal
created_by: claude:65d845d9
created_at: 2026-03-13T17:29:56Z
closed_at: 2026-03-14T23:45:44Z
close_reason: Implemented and committed in silvery 5b25c8f + termless 3887c47
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] SILVERY_STRICT_TERMINAL: buffer-vs-backend cell comparison invariant @km/silvery #task #P1 @claude:c9beade3

Feed fresh and incremental output into independent emulator (xterm.js headless). Compare visible cell grid + cursor position + scroll state. This catches both capability-variance bugs (OSC 66) and physical-boundary bugs (buffer overflow). Keep STRICT_OUTPUT for fast internal consistency. See docs/lessons/testing-escape-hatches.md.


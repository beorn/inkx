---
id: "@km/inbox/gg3fh"
aliases:
  - km-gg3fh
  - "@km/_orphan/gg3fh"
created_by: claude:c9beade3
created_at: 2026-03-13T23:20:40Z
closed_at: 2026-03-13T23:45:55Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] termless: scrollback/viewport coordinate contract inconsistent across backends @km/_orphan #bug #P0 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

Files: src/types.ts, src/views.ts, src/assertions.ts, packages/xtermjs/src/backend.ts, packages/ghostty/src/backend.ts, packages/vt100/src/backend.ts, packages/vt100/src/screen.ts
Classification: P0

views.ts assumes getLine/getCell/getTextRange take absolute buffer rows. xterm mostly behaves that way; Ghostty/VT100 wrappers do not. viewportOffset means different things across backends. Result: screen, viewport, row, cell, and scrollback assertions are backend-dependent and wrong after scrolling.

Suggested fix: Define protocol: (1) getLine/getCell/getTextRange use absolute buffer rows, (2) pick viewportTopRow or scrollbackOffsetFromBottom consistently, (3) add shared tests for screen/viewport/scrollback semantics on every backend.
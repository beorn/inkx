---
mentions:
  - km
id: "@km/silvery/cursor-visibility"
aliases:
  - km-silvery.cursor-visibility
  - km-silvery-cursor-visibility
created_by: Bjørn Stabell
created_at: 2026-04-01T07:28:32Z
owner: bjorn@stabell.org
---

# [ ] Test cursor visibility via termless (DECTCEM) @km/silvery #task #P3

xterm.js headless always returns visible:true for getCursor(). DECTCEM (cursor show/hide) is handled by the renderer, not tracked in headless mode. Options:

1. Use vterm backend (tracks DECTCEM)
2. Intercept the escape sequence in the mock stdout
3. Accept as xterm.js limitation, test with multi-backend

This blocks toHaveCursorHidden() assertions in emulator tests.


---
id: "@km/_orphan/5bxg"
aliases:
  - km-5bxg
created_at: 2026-01-22T07:27:41Z
closed_at: 2026-01-22T19:25:58Z
---

# [x] Visual testing (ttyd+Playwright) not rendering TUI @km/_orphan #bug #P0

Root cause identified:

The WebSocket connection closes when Playwright's screenshot command completes, which kills the TUI process via SIGHUP before it finishes rendering. The logs show:
- WS connects
- Process starts (pid: XXXXX)
- WS closes immediately (~300ms later)
- Process killed with signal 1

Solution: Keep Playwright's browser page open while waiting for content, then capture. The stabilization logic was correct, but we need to prevent premature disconnection.
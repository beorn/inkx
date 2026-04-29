---
id: "@km/inkx/event-loop-hang"
aliases:
  - km-inkx.event-loop-hang
  - km-inkx-event-loop-hang
created_by: claude:d1f60fb4
created_at: 2026-02-25T20:47:31Z
closed_at: 2026-02-27T13:15:20Z
---

# [x] render() unmount doesn't release all event loop references @km/inkx #bug #P2

After calling unmount() and resolving the exit promise, the process event loop stays alive. Requires explicit process.exit(0) after waitUntilExit(). stdin.unref() after destroy() doesn't help — something else (reconciler? scheduler internal?) is keeping the loop alive.
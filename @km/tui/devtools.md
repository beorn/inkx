---
mentions:
  - km
  - claude
id: "@km/tui/devtools"
aliases:
  - km-tui.devtools
  - km-tui-devtools
created_by: claude:97b8de73
created_at: 2026-02-23T13:55:19Z
closed_at: 2026-02-23T14:01:08Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Integrate React DevTools for profiling TUI component trees @km/tui #task #P2 @claude:97b8de73

Set up react-devtools-core integration for km view. Dependencies installed (react-devtools-core, ws). Need to: (1) document workflow (launch devtools, DEBUG_DEVTOOLS=1 bun km view), (2) verify it connects and shows the km component tree, (3) use Profiler tab for flame graph breakdown of mount/update times.


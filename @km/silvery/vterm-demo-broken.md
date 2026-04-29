---
id: "@km/silvery/vterm-demo-broken"
aliases:
  - km-silvery.vterm-demo-broken
  - km-silvery-vterm-demo-broken
created_by: Bjørn Stabell
created_at: 2026-04-03T14:51:24Z
closed_at: 2026-04-03T15:38:10Z
close_reason: "Root cause: ListView virtual cache unmounts items in fullscreen
  (no scrollback to display them). Fix: added 'retain' cache backend — cached
  but kept in render tree. Also fixed demos to use useWindowSize() instead of
  process.stdout.rows."
owner: bjorn@stabell.org
---

# [x] [bug] Demo apps (vterm-demo, aichat): fullscreen mode shows only one rotating line @km/silvery #bug #P3

Both demo apps show only one line at the top that rotates between entries:
- bun examples/apps/vterm-demo/index.tsx
- bun examples/apps/aichat/index.tsx

Both default to fullscreen mode. The fullscreen rendering works fine for km's board view, so the issue is specific to these demos — likely related to how they set up the runtime or how ListView interacts with fullscreen.

Reproduce: cd vendor/silvery && bun examples/apps/aichat/index.tsx
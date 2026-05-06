---
mentions:
  - km
  - claude
id: "@km/silvery/compat-render-simplify"
aliases:
  - km-silvery.compat-render-simplify
  - km-silvery-compat-render-simplify
created_by: claude:474834b0
created_at: 2026-03-10T05:51:29Z
closed_at: 2026-03-10T06:51:57Z
close_reason: "Simplified compat render() test path from ~350 lines to ~80 lines
  by delegating to silvery's test renderer with new autoRender + onFrame
  options. Also fixed: broken imports (ansi→term, @silvery/compat/ink),
  ANSI-aware empty fragment detection, single-write stdout (cursor escapes
  combined), ANSI color conversion in renderToString helper. Compat test score:
  124/134 (92.5%). Remaining 10 failures are deeper gaps tracked in
  km-silvery.ink-compat-audit."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Simplify compat render() to delegate to silvery render directly @km/silvery #task #P2 @claude:474834b0


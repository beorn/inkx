---
id: "@km/silvery/canvas-layer-violations"
aliases:
  - km-silvery.canvas-layer-violations
  - km-silvery-canvas-layer-violations
created_by: claude:fed8de9e
created_at: 2026-03-30T21:31:13Z
closed_at: 2026-03-30T21:31:33Z
---

# [x] Canvas imports terminal/node modules — layer violations @km/silvery #bug #P1 @claude:fed8de9e

Canvas entry point (@silvery/ag-react/ui/canvas) transitively imports Node.js-specific modules through the pipeline barrel and @silvery/ansi barrel, causing crashes in browser environments.

Fixed in commit e3fefd5:
1. detection.ts: child_process import made lazy (require() inside try/catch in detectMacOSDarkMode)
2. output-phase.ts: top-level process.env reads guarded with typeof process check
3. render-text.ts: SILVERY_BG_CONFLICT env read guarded
4. render-phase.ts/layout-phase.ts: SILVERY_STRICT env reads guarded
5. vite.config.ts: removed all Node.js stub aliases (child_process, fs, os, tty, process.env/stdout)

The canvas path now loads cleanly without any Node.js module stubs.
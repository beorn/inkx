---
id: "@km/inkx/zoom-mismatch"
aliases:
  - km-inkx.zoom-mismatch
  - km-inkx-zoom-mismatch
created_by: claude:d697f216
created_at: 2026-02-25T12:02:24Z
closed_at: 2026-02-25T13:44:13Z
---

# [x] INKX_STRICT mismatch at (27,14) after zoom out/in on Asana import @km/inkx #bug #P1 @claude:d697f216

INKX_CHECK_INCREMENTAL detects mismatch after zooming out then in on imports/asana/stabell. Incremental shows space (no attrs), fresh shows 'e' with fg=6 dim underline ulStyle=single (a link character). Content phase #0: 5289 visited, 3188 rendered, 16 skipped, 3123 clearOps. The massive cascade suggests a layout-change-driven re-render is missing a node. Full crash log: /tmp/@km/crash-1772049518615/log
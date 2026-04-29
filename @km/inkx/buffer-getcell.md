---
id: "@km/inkx/buffer-getcell"
aliases:
  - km-inkx.buffer-getcell
  - km-inkx-buffer-getcell
created_at: 2026-02-05T12:50:47Z
closed_at: 2026-02-06T21:48:53Z
assignee: claude:a3625ec3
---

# [x] perf(inkx): Reduce getCell allocations on hot render paths @km/inkx #task #P2 @claude:a3625ec3

getCell allocates fresh Cell+attrs per call. ~20K objects/frame. Options: getCellInto, setBg, direct packed data.
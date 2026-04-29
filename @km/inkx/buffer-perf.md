---
id: "@km/inkx/buffer-perf"
aliases:
  - km-inkx.buffer-perf
  - km-inkx-buffer-perf
created_at: 2026-02-05T12:28:21Z
closed_at: 2026-02-06T21:48:53Z
---

# [x] perf(inkx): batch buffer.fill + pre-allocate diffBuffers @km/inkx #task #P2 @claude:a3625ec3

Code review P1+P3: fill() calls setCell() per cell, diffBuffers allocates CellChange per cell. Batch fill, pre-allocated pool.
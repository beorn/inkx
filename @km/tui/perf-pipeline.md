---
mentions:
  - km
id: "@km/tui/perf-pipeline"
aliases:
  - km-tui.perf-pipeline
  - km-tui-perf-pipeline
created_by: claude:499eee95
created_at: 2026-02-13T18:27:47Z
closed_at: 2026-02-13T18:45:27Z
owner: bjorn@stabell.org
---

# [x] Pipeline timing threshold too tight (113ms > 100ms) @km/tui #bug #P3

cursor-perf.test.tsx:112 fails: per-phase timing on large board (8 cols × 60 cards) takes 113ms, exceeds 100ms threshold.

Options: relax threshold to 150ms, optimize pipeline, or make test conditional on CPU load.


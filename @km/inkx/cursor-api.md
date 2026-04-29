---
id: "@km/inkx/cursor-api"
aliases:
  - km-inkx.cursor-api
  - km-inkx-cursor-api
created_at: 2026-02-09T12:23:40Z
closed_at: 2026-02-09T12:50:07Z
---

# [x] useCursor() hook for terminal cursor management @km/inkx #feature #P3 @claude:a3625ec3

Add a useCursor() hook that leverages useScreenRect() to provide cursor positioning. Solves Ink's longest-open feature request (#251, open since 2019). Ink can't fix this because cursor positioning requires layout feedback. See docs/ink-comparison.md.
---
id: "@km/_orphan/3fr2m"
aliases:
  - km-3fr2m
created_by: claude:8f007ba9
created_at: 2026-02-19T21:25:02Z
closed_at: 2026-02-19T21:27:00Z
---

# [x] Logger setOutputMode API — configurable output routing @km/_orphan #feature #P3

Added setOutputMode(console|stderr|writers-only) to @beorn/logger. Allows controlling where writeLog sends output: console (default, captured by Ink patchConsole for TUI panel), stderr (bypasses Ink, visible in terminal), writers-only (silent, only addWriter sinks). Spans always use stderr regardless. Committed and shipped.
---
mentions:
  - km
id: "@km/load-perf/1-single-pass-text-extraction"
aliases:
  - km-load-perf.1
  - km-load-perf-1
  - "@km/load-perf/1"
created_at: 2026-01-23T15:03:42Z
closed_at: 2026-01-23T15:22:47Z
---

# [x] Single-pass text extraction @km/load-perf #task #P2

Combine wikilink, mention, tag, project extraction into single regex pass.
Currently 4+ separate regex passes per content string.

File: packages/@km/markdown/src/ast2nodes.ts  
Lines: 198 (wikilinks), 241-243 (mentions/tags/projects)

Expected impact: 20-30% faster parsing


---
mentions:
  - km
id: "@km/load-perf/0-single-pass-filesystem-scan"
aliases:
  - km-load-perf.0
  - km-load-perf-0
  - "@km/load-perf/0"
created_at: 2026-01-23T15:03:42Z
closed_at: 2026-01-23T15:22:47Z
---

# [x] Single-pass filesystem scan @km/load-perf #task #P2

Merge countMarkdownFiles() + scanDirectory() into unified scan.
Currently traverses same directory tree twice - once to count, once to parse.

File: packages/@km/storage/src/vault-loader.ts
Lines: 216 (countMarkdownFiles), 226 (scanDirectory)

Expected impact: 2x faster discovery phase


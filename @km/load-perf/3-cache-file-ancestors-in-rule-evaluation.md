---
mentions:
  - km
id: "@km/load-perf/3-cache-file-ancestors-in-rule-evaluation"
aliases:
  - km-load-perf.3
  - km-load-perf-3
  - "@km/load-perf/3"
created_at: 2026-01-23T15:03:43Z
closed_at: 2026-01-23T15:22:47Z
---

# [x] Cache file ancestors in rule evaluation @km/load-perf #task #P3

Build Map<nodeId, fileAncestor> once at start of rule evaluation.
Currently walks ancestor chain per embed via findFileAncestor().

File: packages/@km/storage/src/db-rules.ts
Lines: 239-248 (findFileAncestor)

Expected impact: 20-40% faster rule materialization


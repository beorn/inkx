---
id: "@km/fast-md/1-module-level-regex-compilation"
aliases:
  - km-fast-md.1
  - km-fast-md-1
  - "@km/fast-md/1"
created_at: 2026-01-23T15:25:58Z
closed_at: 2026-01-23T15:43:48Z
---

# [x] Module-level regex compilation @km/fast-md #task #P2

Compile regexes once at module level instead of per-call. Affects parseWikiLinks, parseTaskMetadata, parseHeadingRules, parseInlineProperties.
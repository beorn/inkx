---
mentions:
  - km
id: "@km/fast-md/2-fast-path-wikilink-detection"
aliases:
  - km-fast-md.2
  - km-fast-md-2
  - "@km/fast-md/2"
created_at: 2026-01-23T15:25:58Z
closed_at: 2026-01-23T15:43:48Z
---

# [x] Fast-path wikilink detection @km/fast-md #task #P2

Check text.includes('[[') before running complex 5-capture-group regex. Most paragraphs have no wikilinks.


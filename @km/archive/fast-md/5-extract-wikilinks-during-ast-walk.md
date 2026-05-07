---
mentions:
  - km
id: "@km/fast-md/5-extract-wikilinks-during-ast-walk"
aliases:
  - km-fast-md.5
  - km-fast-md-5
  - "@km/fast-md/5"
created_at: 2026-01-23T15:25:58Z
closed_at: 2026-01-23T15:43:48Z
---

# [x] Extract wikilinks during AST walk @km/fast-md #task #P3

Currently extracts wikilinks in post-processing loop. Move to astToNodes to avoid second pass over nodes.


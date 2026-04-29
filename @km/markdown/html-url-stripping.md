---
id: "@km/markdown/html-url-stripping"
aliases:
  - km-markdown.html-url-stripping
  - km-markdown-html-url-stripping
created_by: Bjørn Stabell
created_at: 2026-04-06T20:46:38Z
---

# [ ] [bug] Markdown parser drops <corge> and https:// scheme — data loss in display @km/markdown #bug #P2

Source: '<corge>' renders as ''. Source: 'https://example.com' renders as 'example.com'. Round-trip lossy in display. Fix in ast2nodes.ts.
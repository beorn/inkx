---
id: "@km/markdown/ff-syntax"
aliases:
  - km-markdown.ff-syntax
  - km-markdown-ff-syntax
created_by: claude:b92140a2
created_at: 2026-03-17T05:58:13Z
closed_at: 2026-03-17T06:06:47Z
close_reason: "Extended micromark wikilink extension to parse ./ prefix
  (relative: true flag). Updated both AST parser and regex-based parseWikiLinks.
  5 AST tests + 5 regex tests in packages/km-markdown/tests/ all pass."
owner: bjorn@stabell.org
---

# [x] Parser: ![[./child]] relative embed syntax @km/markdown #task #P2

Extend micromark wikilink extension to recognize ./ prefix on embeds. Extract relative: true flag on parsed link. Serializer writes ![[./name]] for structural child references.
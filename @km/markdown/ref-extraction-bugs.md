---
mentions:
  - km
  - claude
id: "@km/markdown/ref-extraction-bugs"
aliases:
  - km-markdown.ref-extraction-bugs
  - km-markdown-ref-extraction-bugs
created_by: claude:c9beade3
created_at: 2026-03-13T06:22:55Z
closed_at: 2026-03-13T07:09:37Z
close_reason: "Fixed in Pro Review Round 1: embed dedup removal, H1 metadata
  round-trip, code fence backtick handling, malformed frontmatter preservation,
  footnote cleanup, ref extraction cleanText, table alignment/escaping, list
  item multi-paragraph + ordered numbering. All with TDD (19+ new tests)."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Ref extraction scans inline property values, producing false-positive tags/mentions @km/markdown #bug #P1 @claude:c9beade3

kmRefsTransform reads nodeToText() instead of cleanText, so refs inside key:: value and km.* rule values are extracted. Example: owner:: @alice pollutes refs. Fix: read node.data?.cleanText ?? nodeToText(). Also: exported extractTags/Mentions/Projects are ASCII-only while internal extractAllRefs is Unicode-aware.


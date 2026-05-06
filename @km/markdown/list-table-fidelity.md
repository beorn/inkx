---
mentions:
  - km
  - claude
id: "@km/markdown/list-table-fidelity"
aliases:
  - km-markdown.list-table-fidelity
  - km-markdown-list-table-fidelity
created_by: claude:c9beade3
created_at: 2026-03-13T06:22:56Z
closed_at: 2026-03-13T07:09:37Z
close_reason: "Fixed in Pro Review Round 1: embed dedup removal, H1 metadata
  round-trip, code fence backtick handling, malformed frontmatter preservation,
  footnote cleanup, ref extraction cleanText, table alignment/escaping, list
  item multi-paragraph + ordered numbering. All with TDD (19+ new tests)."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Ordered list numbering, bullet styles, and table alignment not preserved @km/markdown #bug #P1 @claude:c9beade3

Three P1 fidelity issues: (1) Only ordered:boolean kept, discarding start number and marker style. (2) Table alignment info (mdast align) ignored, always emits plain ---. (3) Pipe chars in cells not escaped, can split columns on reparse.


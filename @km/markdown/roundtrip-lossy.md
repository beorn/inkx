---
id: "@km/markdown/roundtrip-lossy"
aliases:
  - km-markdown.roundtrip-lossy
  - km-markdown-roundtrip-lossy
created_by: claude:c9beade3
created_at: 2026-03-13T06:22:53Z
closed_at: 2026-03-13T07:09:37Z
close_reason: "Fixed in Pro Review Round 1: embed dedup removal, H1 metadata
  round-trip, code fence backtick handling, malformed frontmatter preservation,
  footnote cleanup, ref extraction cleanText, table alignment/escaping, list
  item multi-paragraph + ordered numbering. All with TDD (19+ new tests)."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Round-trip fidelity: 6 P0 silent data loss bugs found by GPT 5.4 Pro @km/markdown #epic #P1 @claude:c9beade3

GPT 5.4 Pro review ($7.24) found 6 P0 data loss paths: duplicate embeds dropped in serialization, root H1 metadata (task_marker, rules, block_id) not round-tripped, multi-paragraph list items flattened, code fences break on embedded backticks, GFM footnotes enabled but silently dropped, malformed YAML frontmatter discarded without preservation. Full output: /tmp/llm-c9beade3-1773381717655-4wqr.txt
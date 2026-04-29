---
id: "@km/tui/import-escaping"
aliases:
  - km-tui.import-escaping
  - km-tui-import-escaping
created_by: claude:36393b5d
created_at: 2026-02-19T14:13:24Z
closed_at: 2026-02-19T14:22:21Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Import: HTML-to-markdown doesn't escape special chars (* [ ] # etc.) @km/tui #bug #P1 @claude:36393b5d

Turndown HTML→markdown conversion doesn't escape markdown special characters in plain text. Examples from real Asana data:
- * in text becomes italic (unescaped asterisk)
- [roadmap outline] becomes part of a markdown link (unescaped brackets)
- [text] followed by (url) gets interpreted as [text](url) link

Needs: comprehensive test suite for all quoting situations, then fix either via Turndown escaping rules or by creating KNodes directly from HTML (skipping markdown).
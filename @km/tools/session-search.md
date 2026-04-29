---
id: "@km/tools/session-search"
aliases:
  - km-tools.session-search
  - km-tools-session-search
created_at: 2026-02-04T11:55:24Z
closed_at: 2026-02-04T12:25:43Z
assignee: claude:a7826e85
---

# [x] Claude session skill should search, not cat tool-results @km/tools #bug #P2 @claude:a7826e85

The Claude Code session skill sometimes tries to read entire tool-results files which can be huge (30k+ tokens). It should: (1) Never cat/read entire tool-results or session files, (2) Always use grep/search to find specific content, (3) Consider RAG indexing for better search of session artifacts. This causes context overflow and wastes tokens on irrelevant content.
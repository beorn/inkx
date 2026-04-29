---
id: "@km/_orphan/claude-session"
aliases:
  - km-claude-session
created_at: 2026-01-27T21:38:32Z
closed_at: 2026-02-04T11:55:34Z
---

# [x] Claude session skill should search, not cat tool-results @km/_orphan #bug #P2

The Claude Code session skill sometimes tries to read entire tool-results files which can be huge (30k+ tokens). It should:

1. Never cat/read entire tool-results or session files
2. Always use grep/search to find specific content
3. Consider RAG indexing for better search of session artifacts

This causes context overflow and wastes tokens on irrelevant content.
---
mentions:
  - km
  - claude
id: "@km/tools/history"
aliases:
  - km-tools.history
  - km-tools-history
created_at: 2026-02-04T11:55:25Z
closed_at: 2026-02-04T12:27:42Z
assignee: claude:a7826e85
---

# [x] Integrated history/memory for Claude Code sessions @km/tools #feature #P2 @claude:a7826e85

Cross-session history search and activity tracking for Claude Code. Full-text search over conversation history, session activity dashboard, de-duplication of expensive research queries, agent coordination. Implementation: SQLite with FTS5, parse ~/.claude/projects/ session files (JSONL), MCP server integration.


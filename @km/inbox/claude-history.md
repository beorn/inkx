---
id: "@km/inbox/claude-history"
aliases:
  - km-claude-history
  - "@km/_orphan/claude-history"
created_at: 2026-01-30T07:33:04Z
closed_at: 2026-02-04T11:55:34Z
---

# [x] Integrated history/memory for Claude Code sessions @km/_orphan #feature #P2

Cross-session history search and activity tracking for Claude Code. Key capabilities:

1. **Full-text search over conversation history** - quickly find and reference past research, decisions, and solutions
2. **Session activity dashboard** - see what all active sessions are working on, what happened in the last hour/day
3. **De-duplication** - detect when asking similar expensive research questions to leverage cached results
4. **Agent coordination** - fast view of all active agents to avoid stepping on each other's work

**Context:**
- Should complement (not replace) the new Claude Code swarms feature (TeammateTool, inter-agent messaging)
- Related to @km/_orphan/multi-llm bead for multi-LLM research consolidation
- Swarms handles real-time coordination; this handles persistent memory/history

**Implementation considerations:**
- SQLite with FTS5 for full-text search
- Parse ~/.claude/projects/ session files (JSONL format)
- Index: prompts, responses, tool calls, timestamps, file paths touched
- MCP server for integration with Claude Code
- CLI commands for quick queries

**Use cases:**
- 'What did we work on the last hour?'
- 'Have we researched X before?'
- 'What are all active agents doing right now?'
- 'Show me decisions about architecture Y'
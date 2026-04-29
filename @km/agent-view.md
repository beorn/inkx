---
id: "@km/agent-view"
aliases:
  - km-agent-view
  - "@km/_orphan/agent-view"
created_by: claude:c6244087
created_at: 2026-04-23T06:13:02Z
owner: bjorn@stabell.org
---

# [ ] Agent view — iMessage-style Claude Code session viewer (silvery showcase) @km/agent-view #feature #P2

Real-time viewer for `~/.claude/projects/*/*.jsonl` sessions, rendered as a chat UI. Silvery showcase first; architected so it could later become a real coding-agent frontend. Sibling to @km/logview (shares ViewConfig + Claude parser; differs in UI surface).
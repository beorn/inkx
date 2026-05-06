---
mentions:
  - km
id: "@km/bearly/recall-memory-backbone"
aliases:
  - km-bearly.recall-memory-backbone
  - km-bearly-recall-memory-backbone
created_by: claude:2405c72e
created_at: 2026-04-27T21:57:34Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.recall-memory-backbone
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-27T14:57:47Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [ ] Recall as multi-agent/provider memory backbone @km/bearly #feature #P2

blocks:: [[@km/bearly]]

Reframe @bearly/recall to become THE memory subsystem for the bearly tool family.

Today: each tool (llm, lore, etc.) has its own getMemoryDir() that hardcodes ~/.claude/projects/<proj>/memory. Claude-Code-only.

Future shape:

- @bearly/recall exposes a memory API: getMemoryDir(scope?), readSession(id), populateContext(prompt)
- Multi-agent/provider: indexes session transcripts from Claude Code AND Codex AND Cursor AND any harness that drops JSONL session files in a known location
- @bearly/llm calls recall.getMemoryDir() instead of computing its own path
- The 'similar past queries' hint becomes recall.findSimilarPrompts(query)
- Auto-recall hook (UserPromptSubmit) becomes recall.injectContext(prompt)

Acceptance:

- @bearly/llm has zero knowledge of where memory physically lives
- @bearly/recall handles project-scope detection (CLAUDE_PROJECT_DIR or git root or LLM_DIR env)
- Multi-harness: same recall instance can index Claude Code + Codex + Cursor sessions
- A new tool @bearly/foo can plug in for free

Effort: ~4-6 hours. Touches @bearly/recall (API expansion) + @bearly/llm (call sites).

Deferred from Phase 5a of @bearly/llm 0.9.0 refactor (2026-04-27); G1 in Phase 5 covers the simpler standalone path (LLM_DIR env override) until this lands.


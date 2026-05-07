---
mentions:
  - km
  - km
  - claude
id: "@km/silvercode/acp-claude-acp-loadsession"
aliases:
  - km-silvercode.acp-claude-acp-loadsession
  - km-silvercode-acp-claude-acp-loadsession
created_by: claude:cd034ca4
created_at: 2026-04-26T16:18:21Z
closed_at: 2026-04-26T22:03:07Z
close_reason: Closed
started_at: 2026-04-26T21:47:28Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-claude-acp-loadsession
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T09:18:37Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-claude-acp-loadsession
    depends_on_id: km-silvercode.acp-session-load
    type: blocks
    created_at: 2026-04-26T09:18:37Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.acp
      - type: link
        target: km-silvercode.acp-session-load
---

# [x] @km/claude-acp loadSession — replay session JSONL as ACP SessionUpdate notifications @km/silvercode #feature #P3 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session-load]]

Phase-2 of session-load support: implement loadSession in @km/claude-acp so resuming a Claude session via ACP works. Generic resume support landed in @km/silvercode/acp-session-load.

## Today

@km/claude-acp advertises loadSession: false. Calling agent.loadSession on it throws AcpResumeUnsupportedError. Resume only works against agents that already implement it (codex, pi-acp confirmed; gemini partial).

## Target

1. server.ts: change initialize response to advertise loadSession: true
2. Implement Agent.loadSession({sessionId, cwd, mcpServers}):
- Resolve JSONL path: ~/.claude/projects/<encodedCwd>/<sessionId>.jsonl
- Read each line as a stream-json AgentEvent
- Translate each AgentEvent through wire.ts to ACP SessionUpdate notifications
- Emit notifications via connRef.sessionUpdate({sessionId, update})
- After replay: spawn claude with --resume <sessionId> and attach wire (mirrors newSession path)
- Return empty LoadSessionResponse {}
11. Handle file-not-found: throw RequestError(-32000, 'session not found')
12. Skip unsupported event kinds during replay (silently — they were already handled in the legacy session)

## Acceptance

- bun apps/silvercode/tests/probe-acp.ts claude-code 'continue' --resume <prior-sessionId> succeeds with stop_reason=end_turn
- Test fixture: a real session JSONL replays as the expected SessionUpdate sequence (round-trip via boundary adapter)
- @km/claude-acp tests pass; resume integration test in agent-harness probes the flow end-to-end via in-memory transport


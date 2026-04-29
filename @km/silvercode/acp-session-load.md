---
id: "@km/silvercode/acp-session-load"
aliases:
  - km-silvercode.acp-session-load
  - km-silvercode-acp-session-load
created_by: claude:cd034ca4
created_at: 2026-04-26T16:01:51Z
closed_at: 2026-04-26T16:18:38Z
close_reason: >-
  Phase 1 shipped. Generic resume across all ACP agents:


  - AcpConnectOpts.resume = { sessionId } calls agent.loadSession instead of
  agent.newSession

  - AcpResumeUnsupportedError thrown when agent advertises loadSession: false
  (capability gate)

  - AcpAgentSession.loadSession(sessionId, opts?) for in-connection resume

  - connectAcpRegistry passes resume opt through (per-agent support documented
  inline)

  - probe-acp --resume <id> flag


  ## Verified end-to-end

  - codex (loadSession: true): resumed session 019dca93-..., agent answered
  prior-context question, stop_reason=end_turn

  - pi-acp (loadSession: true): connected, loadSession dispatched, agent
  rejected fake id with Invalid params (expected)

  - claude-code (loadSession: false): AcpResumeUnsupportedError surfaced cleanly
  with hint


  ## Tests

  9/9 connect tests pass (3 new for resume); 151/152 agent-harness suite pass.


  ## Phase 2 (split out)

  @km/claude-acp JSONL replay tracked as
  km-silvercode.acp-claude-acp-loadsession (P3).
---

# [x] silvercode acp session/load — resume support across all ACP agents @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-probe-runner]]

Wire ACP `session/load` so silvercode's --resume flag works against any registered ACP agent that advertises `loadSession` capability.

## Today
- AgentCapabilities.loadSession is defined in our boundary types and translated bidirectionally
- connectAcp() always calls agent.newSession() — never loadSession
- skipNewSession escape hatch exists but no ergonomic resume API
- @km/claude-acp does NOT advertise loadSession (legacy spawnClaude handles --resume via stream-json replay)

## Target
1. Extend AcpConnectOpts with `resume?: { sessionId, cwd?, mcpServers? }`. When present, call agent.loadSession() and capability-check first; throw typed AcpResumeUnsupported error if loadSession === false.
2. Add `acpAgentSession.loadSession(sessionId)` convenience method for resuming within an open connection.
3. Update @km/claude-acp to advertise loadSession: true. Implement load by reading session JSONL from ~/.claude/projects/<projDir>/<sessionId>.jsonl and replaying each entry as the corresponding SessionUpdate notification (mirrors what claude binary does today).
4. silvercode bootstrap --resume <id> threads through controller → connectAcpRegistry with resume opt set.

## Acceptance
- `bun silvercode --agent codex --resume <id>` resumes a codex session if codex-acp supports it
- `bun silvercode --agent claude-code --resume <id>` resumes via @km/claude-acp's JSONL replay
- Agents that don't advertise loadSession produce a clear error message naming the missing capability
- Tests cover: capability gate, resume opt translation, JSONL replay correctness in @km/claude-acp

## ACP names per acp-naming.md
- LoadSessionRequest, LoadSessionResponse (boundary types)
- AcpResumeUnsupported (silvercode error class)
- SessionUpdate replay (no new wire types)

## Deps
- @km/silvercode/acp-probe-runner (smoke-test resume per agent before wiring controller)
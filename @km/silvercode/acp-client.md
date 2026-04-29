---
id: "@km/silvercode/acp-client"
aliases:
  - km-silvercode.acp-client
  - km-silvercode-acp-client
created_by: claude:cd034ca4
created_at: 2026-04-26T08:10:26Z
closed_at: 2026-04-26T09:30:30Z
close_reason: >-
  Done — connectAcp(scope, opts) ships in
  apps/silvercode/packages/agent-harness/src/acp-client.ts.


  Deliverables:

  - Scope-bound ClientSideConnection factory using node:child_process +
  Readable/Writable.toWeb (matches SDK's own example client pattern). Disposing
  the scope SIGTERMs the child with 250ms SIGKILL fallback; in-flight prompts
  abort via the connection's AbortSignal.

  - AcpAgentSession extends the existing AgentSession (events.ts) so
  session-store consumes ACP-spawned sessions identically. Adds agent
  (ClientSideConnection), capabilities (AgentCapabilities), authMethods
  (AuthMethod[]), protocolVersion, prompt(), cancel(), authenticate().

  - Client callbacks bridge: sessionUpdate → acpToSilvercode + inline mapper
  (agent_message_chunk → text-delta, tool_call → tool-use, tool_call_update →
  tool-result/status). Retires once acp-session ships.

  - requestPermission → opts.permissionHandler (default = cancelled + error
  event with clear "wire permissionHandler" message).

  - readTextFile / writeTextFile / terminal/* → opts.fsHandler /
  opts.terminalHandler (conditional spread keeps capability advertising
  correct).

  - connectAcpRegistry(scope, "codex"|"gemini"|"github-copilot-cli"|"pi-acp",
  opts) — table-driven dispatch with extraArgs override + comment marker to
  update on new agents.

  - Test seam: __setAcpSpawnForTesting() injects an AcpSpawn for tests;
  production never calls it.


  Tests (6/6 pass, real in-process AgentSideConnection on the other end of two
  Duplex streams — actual ndJsonStream wire, no SDK mocking):

  - initialize + newSession round-trip; capabilities surface in handle.

  - scope.dispose() kills the child (SIGTERM signal verified).

  - sessionUpdate notifications trigger AgentEvent subscribers.

  - prompt round-trip — handle.prompt() returns stop reason.

  - permissionHandler invoked; outcome flows back.

  - Missing permissionHandler defaults to cancelled + permission-request + error
  events.


  Verification:

  - bun vitest run apps/silvercode/packages/agent-harness/ → 71 passed | 1
  skipped (no regressions).

  - bun tsc --noEmit -p apps/silvercode → zero acp-client errors.

  - bun run oxlint on new files → 0 warnings, 0 errors.


  Out of scope (deferred): acp-adapter-claude (Claude Code wrapping), AuthMethod
  picker UI, full MCP wiring (pass-through only here), Layer-2
  standalone-binary.


  Files touched:

  - apps/silvercode/packages/agent-harness/src/acp-client.ts (new)

  - apps/silvercode/packages/agent-harness/tests/acp-client.test.ts (new)

  - apps/silvercode/packages/agent-harness/src/index.ts (exports)

  - apps/silvercode/packages/agent-harness/package.json (+@silvery/scope,
  +./acp-client export)

  - apps/silvercode/packages/agent-harness/CLAUDE.md ("Consuming an external ACP
  server" section)
started_at: 2026-04-26T09:09:32Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-client
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:10:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-client
    depends_on_id: km-silvercode.acp-foundation
    type: blocks
    created_at: 2026-04-26T01:10:26Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] ACP client — scope-bound ClientSideConnection factory with capability negotiation @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-foundation]]

Build connectAcp(scope, opts) returning a ClientSideConnection wired to a child process over ndJsonStream. Handles initialize (protocol-version + capability exchange), authenticate (subscription OAuth), newSession/loadSession/listSessions/cancel. Implements the four Client callbacks: requestPermission, sessionUpdate, readTextFile, writeTextFile (plus terminal/* if FS capabilities advertise them). Scope-bound: disposing scope kills child process, closes stream, aborts in-flight prompts. Reference: hub/silvery/future/ai-terminal/10-agent-router-landscape.md § How ACP is set up and consumed.
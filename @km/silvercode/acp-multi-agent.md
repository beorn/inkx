---
id: "@km/silvercode/acp-multi-agent"
aliases:
  - km-silvercode.acp-multi-agent
  - km-silvercode-acp-multi-agent
created_by: claude:cd034ca4
created_at: 2026-04-26T08:42:22Z
closed_at: 2026-04-26T10:07:22Z
close_reason: >-
  Implemented cross-agent orchestration at silvercode-app level.


  DELIVERABLES:

  - apps/silvercode/src/cross-agent-state.ts (NEW): signal-backed
  CrossAgentState store. claims (FileClaim[]), handoffs (Handoff[]),
  activeSessions (SessionInfo[]), recentBroadcasts (TribeEvent ring buffer, cap
  50). claimFile / releaseFile / proposeHandoff / acceptHandoff / rejectHandoff
  / addSession / removeSession / updateSessionStatus / recordBroadcast.
  Disposable via @silvery/scope.

  - apps/silvercode/src/coordinator-mcp.ts (NEW): per-session in-process MCP
  server bound to selfSessionId. 6 tools: coordinator_claim_file,
  coordinator_release_file, coordinator_handoff (mutating, dangerous: true → ACP
  RequestPermission), coordinator_status, coordinator_active_sessions,
  coordinator_recent_broadcasts (read-only, auto-approve). JSON-RPC handler
  shape mirrors createTribeMcpServer. createCoordinatorMcpServerSpec returns
  {type: 'in-process'} spec.

  - apps/silvercode/src/prompt-cross-agent.ts (NEW): crossAgentSlice()
  projection — emits typed EmbeddedResource ContentBlock with URI
  coordinator://state/<sessionId>, _meta.coordinator=true, AMBIENT framing.
  assembleAcpPromptWithCrossAgent() composes slice + ambient channel-queue +
  user text (slice FIRST, ambient mid, user text LAST). Opt-in via
  includeCrossAgent flag.

  - apps/silvercode/src/controller.ts (extended): owns one CrossAgentState
  shared across all sessions. Each spawned session gets a coordinatorMcp on its
  SessionHandle bound to its identity. Channel-queue events fan out into
  recordBroadcast. Coarse session status mirrored from
  session-init/turn-start/turn-end/session-end events. closeAll calls
  removeSession (releases held claims). Exposed as controller.crossAgentState.

  - apps/silvercode/src/components/CrossAgentSidebar.tsx (NEW): bare-bones data
  binding (useSignal of activeSessions + claims). Visual polish deferred to
  follow-up component bead per spec.


  CONFLICT MEDIATION: first exclusive claim wins; second exclusive claim on same
  path returns {ok: false, conflictWith: <holder>}. Advisory claims stack.
  Re-claim from same session is idempotent (no signal churn). Documented in code
  + docs/multi-agent.md.


  TESTS (46 new, all passing):

  - apps/silvercode/tests/cross-agent-state.test.ts (16): claim/release
  lifecycle, conflict mediation, idempotency proof via effect publish counter,
  advisory ⇄ exclusive semantics, handoff lifecycle, addSession idempotency
  preserving startedAt, removeSession releases claims, ring-buffer eviction,
  signal reference freshness, scope disposal.

  - apps/silvercode/tests/coordinator-mcp.test.ts (16): dangerous-flag
  classification (exact match), per-tool dispatch, error wrapping, JSON-RPC
  initialize/initialized/tools/list/tools/call, per-session identity isolation,
  McpServerSpec shape.

  - apps/silvercode/tests/prompt-cross-agent.test.ts (14): empty slice → []; URI
  scheme + _meta + AMBIENT framing; peersOnly default; inbound/outbound handoffs
  both render; broadcasts respected; composed-assembly ordering (cross-agent
  FIRST, ambient mid, user text LAST); opt-in toggle behaviour.


  DOC: apps/silvercode/docs/multi-agent.md — architecture diagram (silvercode
  owns state; agents call coordinator-mcp; tribe-mcp handles cross-instance),
  conflict-mediation policy, prompt-projection, controller wiring, transport
  note (in-process by construction; agent-side wiring is follow-up bead), future
  work.


  VERIFICATION:

  - bun vitest run new tests: 46/46 pass

  - bun tsc --noEmit -p apps/silvercode/tsconfig.json: zero errors in new files
  (pre-existing App.tsx + spawn.ts errors unchanged)

  - bun fix: zero lint errors in new files (post-fix)

  - existing controller-using tests (background-tasks, queue-batching,
  esc-parity): 14/14 still pass

  - prompt-assembly + channel-queue tests: 17/17 still pass


  CONSTRAINTS HONORED: only touched apps/silvercode/{src,tests,docs}; packages/*
  untouched (tribe-mcp + km-mcp-server territory respected). No conflict with
  parallel acp-adapter-claude (different package) or acp-storybook (different
  dir).
---

# [x] Cross-agent orchestration — coordinator MCP, cross-agent state, prompt projection @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session]]

Multi-agent setup: silvercode wraps Claude Code + codex + pi + gemini in parallel ACP sessions. ACP doesn't define cross-session sharing — silvercode owns the cross-agent state and projects relevant slices into each agent's prompt.

## Architectural rule
Agents don't talk to each other. silvercode is the orchestrator. ACP defines per-session conversation; silvercode defines cross-session coordination.

## Layers of shared state
1. silvercode's signal-backed cross-agent state store (alien-signals + projections): claims, file locks, plan, broadcasts, handoffs
2. Filesystem (real + virtual via fs/read_text_file with km://, coordinator://, ambient:// URI schemes)
3. Shared MCP servers passed to ALL sessions in session/new: coordinator-mcp, tribe-mcp, lore-mcp, @km/_orphan/mcp
4. Curated prompt assembly per agent — each agent's next prompt includes a slice of cross-agent state relevant to its task
5. Tribe (UDS underneath) — silvercode-to-silvercode coordination across instances/machines/worktrees
6. ACP session/list + session/load for cross-session reads (one agent reads another's transcript as ResourceLink)

## OpenClaw pattern (confirmed prior art)
sessions_send / sessions_list / sessions_history as first-class agent tools, gateway-mediated, with per-tool scope policy (tree | self | agent | all) and cross-agent gate (tools.agentToAgent).

## Acceptance
- coordinator-mcp server: coordinator_claim_file, coordinator_release_file, coordinator_handoff, coordinator_status
- crossAgentState$ store wiring claims + locks + handoffs
- Prompt assembly projects relevant state slice per agent
- Conflict mediation (two agents claim same file)
- UI surfacing of cross-agent activity (notification badges, sidebar pane)

## Reference
- hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Cross-agent cooperation
- OpenClaw cross-session: src/agents/system-prompt.ts, src/gateway/server-session-events.ts, src/agents/subagent-registry-lifecycle.ts
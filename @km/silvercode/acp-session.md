---
id: "@km/silvercode/acp-session"
aliases:
  - km-silvercode.acp-session
  - km-silvercode-acp-session
created_by: claude:cd034ca4
created_at: 2026-04-26T08:10:27Z
closed_at: 2026-04-26T09:48:37Z
close_reason: "Shipped createAcpSession(scope, agentSession, opts) factory at
  apps/silvercode/packages/agent-harness/src/acp-session.ts. Drains legacy
  AgentEvent stream into ACP-shaped reactive primitives:
  id/messages/plan/mode/usage/capabilities/status as alien-signals,
  toolCalls/pendingPermissions as alien-projections (keyed by branded
  ToolCallId/PermissionRequestId), planTree as alien-trees over Plan.entries
  (flat-but-nesting-ready). prompt(content) returns Promise<{stopReason}> that
  resolves on turn-end or cancels on scope-dispose; cancel() and
  respondToPermission() round out the surface. Status derived from (endedFlag,
  pendingSig.length, active toolCall, activeAssistantTurn). Plan auto-derived
  from TodoWrite tool inputs since legacy AgentEvent has no native plan event.
  26 tests passing
  (apps/silvercode/packages/agent-harness/tests/acp-session.test.ts) including
  all 6 fake-fixtures, multi-turn, status transitions, scope-dispose abort.
  CLAUDE.md updated with migration path from createSessionStore. Touches only
  acp-session.ts (new), acp-session.test.ts (new), index.ts (append), CLAUDE.md
  (additive), package.json (deps + export). createSessionStore unchanged — both
  paths coexist for gradual migration."
---

# [x] createAcpSession factory — signals/projections/trees over SessionUpdate stream @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-client]]

Factory returning {id, messages, toolCalls, plan, planTree, mode, usage, prompt(), cancel()} as alien-* reactive primitives. Drains the 11 SessionUpdate variants into typed signals (alien-projections for toolCalls keyed by ToolCallId, alien-trees for Plan.entries, signals for the rest). Capability-gates as signals so UI components can declaratively mount/unmount. promptTurn(session, content) returns alien-resource for cancellable async. UI never sees raw SessionUpdate switches outside the adapter.
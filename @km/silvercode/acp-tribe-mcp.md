---
id: "@km/silvercode/acp-tribe-mcp"
aliases:
  - km-silvercode.acp-tribe-mcp
  - km-silvercode-acp-tribe-mcp
created_by: claude:cd034ca4
created_at: 2026-04-26T08:42:23Z
closed_at: 2026-04-26T09:36:10Z
close_reason: "Implemented full tool surface
  (tribe_send/broadcast/members/history/join/claim_chief/release_chief), added
  explicit dangerous:boolean flag on every ToolDefinition for ACP
  RequestPermission gating, added scope policy (self/tree/agent/all) modeled on
  OpenClaw with TRIBE_SCOPE env default, persisted JSONL backend with sibling
  tribe-state.json for chief and peer registry, added daemon backend hook
  (TRIBE_BACKEND=daemon) for future bearly UDS adapter, 31 tests across 2 files
  passing (tribe.test.ts smoke + tools.test.ts comprehensive: dangerous-flag
  invariants, scope filtering, history filter+pagination, chief leadership,
  JSONL persistence across restarts), README documents tool surface + scope
  semantics + mounting recipe + non-goals (UI subscription is acp-channels
  concern). bun fix exits 0; vitest 31/31 pass; no new typecheck errors. Touched
  only apps/silvercode/packages/tribe-mcp/. Note: the 'depends on
  acp-multi-agent' edge in the bead is reversed — tribe-mcp is a building block
  FOR multi-agent, hence --force."
started_at: 2026-04-26T09:27:49Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-tribe-mcp
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:42:23Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-tribe-mcp
    depends_on_id: km-silvercode.acp-multi-agent
    type: blocks
    created_at: 2026-04-26T01:42:23Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] tribe-mcp — wrap tribe's UDS bus as an MCP server for agent-callable cross-session sync @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-multi-agent]]

Wrap tribe's UDS API as an MCP server (tribe-mcp) and pass it in every silvercode session/new. Agents get tribe access as typed MCP tools — same pattern OpenClaw uses with sessions_send / sessions_list / sessions_history.

## Why
km already uses tribe broadcasts heavily for synchronization (chief election, CI alerts, claim coordination, sub-agent updates). The architecture is in place; what's missing is the agent-facing MCP wrapper so agents themselves participate, not only silvercode-the-orchestrator.

OpenClaw demonstrates this works at production scale.

## Tools to expose
- tribe_send(target, message) — direct message
- tribe_broadcast(message) — to all tribe members
- tribe_members() — discover peers
- tribe_history(filter) — recent messages
- tribe_claim_chief() / tribe_release_chief() — leadership
- tribe_join(name) — joining the bus

## Permission strategy
- Mutating tools (send, broadcast, claim_chief): trigger ACP RequestPermission
- Read-only tools (members, history): auto-approve
- Per-MCP-server scope policy (tree | self | agent | all) modeled on OpenClaw's pattern

## Integration with channel pipeline (@km/silvercode/acp-channels)
Tribe broadcasts arrive at silvercode (subscribed directly to the UDS bus, not via MCP) and:
1. Populate crossAgentState$ store
2. Surface as notification badges in silvercode UI
3. User-invokable inject via /inject-tribe slash command
The tribe-mcp tools give the AGENT the ability to query/send actively. silvercode's direct subscription is for receiving broadcasts.

## Reference
- hub/silvery/future/ai-terminal/10-agent-router-landscape.md § How OpenClaw does it
- Existing tribe MCP (mcp__plugin_tribe_tribe__*) is the reference for tool shape
- OpenClaw equivalent: sessions_send/list/history in src/agents/
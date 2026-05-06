---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-foundation"
aliases:
  - km-silvercode.acp-foundation
  - km-silvercode-acp-foundation
created_by: claude:cd034ca4
created_at: 2026-04-26T08:09:51Z
closed_at: 2026-04-26T09:25:53Z
close_reason: >-
  Built and shipped:

  - src/acp-types.ts: silvercode canonical ACP-shaped surface — SessionUpdate
  (11 variants: user/agent_message_chunk, agent_thought_chunk, tool_call,
  tool_call_update, plan, available_commands_update, current_mode_update,
  config_option_update, session_info_update, usage_update), ToolCall + ToolKind
  (10 kinds: read|edit|delete|move|search|execute|think|fetch|switch_mode|other)
  + ToolCallStatus (pending|in_progress|completed|failed), Plan + PlanEntry,
  ContentBlock (text/image/audio/resource_link/resource),
  AgentCapabilities/ClientCapabilities/FileSystemCapabilities,
  RequestPermission* + PermissionOptionKind
  (allow_once|allow_always|reject_once|reject_always), branded ids
  (SessionId/ToolCallId/PermissionRequestId/PermissionOptionId/SessionModeId).

  - src/acp-boundary.ts: bidirectional acpToSilvercode/silvercodeToAcp +
  acpRequestPermission*/silvercodeRequestPermission* +
  acpAgentCapabilities*/acpClientCapabilities*. ONLY module importing
  @agentclientprotocol/sdk. Exhaustiveness-checked switches throw on unknown
  variants.

  - tests/acp-boundary.test.ts: 37 tests, all green. Every SessionUpdate
  variant, every ToolKind, every PermissionOptionKind, every ContentBlock
  variant, every ToolCallContent variant, both RequestPermissionOutcome variants
  round-trip cleanly.

  - CLAUDE.md: design rules, promotion criterion (Zed 100% spec coverage AND
  protocolVersion 2 with deprecation policy), file map.

  - index.ts re-exports new types and boundary helpers.

  - @agentclientprotocol/sdk@^0.20.0 added as dependency.


  Verification:

  - bun vitest run apps/silvercode/packages/agent-harness/ — 65 pass, 1 skipped
  (pre-existing)

  - bun tsc --noEmit -p apps/silvercode/tsconfig.json — zero errors in new files
  (pre-existing errors in spawn.ts/App.tsx unchanged)

  - bun fix — clean for new files


  Did NOT modify session-store.ts, parse.ts, spawn.ts (out of scope per bead).
  Legacy AgentEvent surface preserved for gradual migration. Commit: 8fd218cb6.
started_at: 2026-04-26T09:09:27Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-foundation
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:10:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.acp
---

# [x] Foundation — silvercode canonical types + ACP boundary adapter @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]]

Define silvercode's canonical internal types (SilvercodeMessage, SilvercodeToolCall, SilvercodePlan, content blocks, capabilities, etc.) shaped like ACP at v1. Build the boundary adapter acpToSilvercode(update: SessionUpdate) → SilvercodeUpdate (~50-100 LOC, the only place @agentclientprotocol/sdk types are imported).

## Why this shape (not direct ACP adoption)

Per adoption research 2026-04-26 (see @km/silvercode/acp parent bead): ACP SDK type surface churned twice in 5 months, Zed doesn't fully implement its own spec, naming collision with IBM/A2A, governance fragility. Domain-model bet at the canonical layer is too risky today. Boundary adapter isolates breaking changes to one file.

## Acceptance

- src/acp-types.ts (or equivalent): silvercode's own typed surface, no @agentclientprotocol/sdk import
- src/adapters/acp-boundary.ts: bidirectional adapter, single file imports ACP types
- Type tests verifying every SessionUpdate variant, ToolKind, PermissionOptionKind round-trips
- Doc: when to bump from canonical-silvercode to canonical-ACP (Zed 100% spec coverage + protocolVersion 2)


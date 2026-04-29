---
id: "@km/silvercode/acp-claude-server"
aliases:
  - km-silvercode.acp-claude-server
  - km-silvercode-acp-claude-server
created_by: claude:cd034ca4
created_at: 2026-04-26T09:00:40Z
closed_at: 2026-04-26T10:19:01Z
close_reason: "Shipped @km/claude-acp standalone ACP server package extracting
  silvercode's internal stream-json → ACP adapter. Subscription-compatible
  (Pro/Max OAuth + ANTHROPIC_API_KEY), the only maintained binary-wrap
  subscription path (claude-agent-acp blocks subscriptions, carlrannaberg/cc-acp
  abandoned). Package at apps/silvercode/packages/claude-acp/ with:
  src/server.ts (Agent impl over AgentSideConnection), src/wire.ts (AgentEvent →
  SessionUpdate translator routing through silvercodeToAcp boundary),
  bin/silvercode-claude-acp.js (#!/usr/bin/env node entry), tests/server.test.ts
  (5 tests: initialize round-trip, newSession spawn, prompt with text deltas,
  tool_call/tool_call_update, cancel), README.md. Also added 'claude-code'
  registry entry to acp-client.ts (npx -y @km/claude-acp). Tests: 5/5 claude-acp
  + 8/8 registry-adapters + 139/139 agent-harness suite. Lint: 0 errors in new
  code (3 require-await warnings on Agent interface methods, consistent with
  existing acp-client.ts). Ready for npm publish (renamed) when external demand
  surfaces."
started_at: 2026-04-26T10:06:48Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-claude-server
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T02:00:40Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-claude-server
    depends_on_id: km-silvercode.acp-adapter-claude
    type: blocks
    created_at: 2026-04-26T02:00:40Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] [FUTURE] silvercode-claude-acp standalone npm package — extract from internal adapter @km/silvercode #feature #P4 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-adapter-claude]]

Future extraction work: take the internal stream-json → ACP-types adapter from @km/silvercode/acp-adapter-claude and package it as silvercode-claude-acp, a standalone Type-A4 ACP server consumable by any ACP client (silvercode, Zed, Neovim, OpenACP).

## Architecture
Same code as the internal adapter, wrapped in AgentSideConnection from @agentclientprotocol/sdk. Each session.apply(...) call serializes as a JSON-RPC session/update notification on stdio. ~50 LOC of additional packaging.

## Why extract
- Subscription-compatible ACP server for Claude — currently no maintained option in the Zed Registry (claude-agent-acp blocks subscriptions, carlrannaberg/cc-acp abandoned)
- Community good — Zed, Neovim, OpenACP, etc. all benefit
- Submittable to Zed's ACP Registry
- Pressure on Anthropic to either bless it or ship their own

## Why defer
- Maintenance commitment (versioning, bug reports, ACP spec churn)
- Internal adapter must stabilize first (validate the architecture before publishing)
- Extraction cost is small; option value is preserved by deferring

## Trigger to extract
- silvercode-internal adapter has been stable for 1-2 months
- External demand exists (Zed users asking, GitHub stars on silvercode for this feature)
- silvercode has spare maintenance bandwidth

## Reference
- Internal adapter: @km/silvercode/acp-adapter-claude
- Prior art (abandoned): carlrannaberg/cc-acp@0.1.1
- hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Recommended path
---
aliases:
  - km-silvercode.agent-host-l5.06-permissions-plans-tools-and-controls
  - km-silvercode-agent-host-l5-06-permissions-plans-tools-and-controls
created_at: 2026-05-08T06:22:35.273Z
---

# [/] Permissions, plans, tools, and controls #feature #P0 @agent/3

Normalize permissions, plans, tool calls, mode/model/config, usage, and session info as first-class domain/control surfaces with durable provenance, capability gates, and projection tests.

## Ownership

This phase owns control-plane models:

- `PermissionRequest` has one owner, one resolution, and explicit expiry/cancel behavior.
- `Plan` and `PlanStep` are canonical; provider todos are projections into it.
- `ToolCall` and `ToolResult` are normalized with ids, status, arguments, result/error, and display policy.
- Mode/model/config/usage updates are state facts, not transcript text.

## Complete Criteria

- Plan, permission, tool, config, and usage tests run through fake provider traffic instead of mocking UI state.
- Legacy `SessionState.todos`-style compatibility is either deleted or linked to a cleanup bead under phase 10.
- Unsupported provider features show explicit capability/fallback behavior in phase 08.

---
id: "@km/silvercode/acp-permission-ui-wire"
aliases:
  - km-silvercode.acp-permission-ui-wire
  - km-silvercode-acp-permission-ui-wire
created_by: claude:cd034ca4
created_at: 2026-04-26T16:26:15Z
closed_at: 2026-04-26T21:34:29Z
close_reason: Closed
started_at: 2026-04-26T21:21:46Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-permission-ui-wire
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T09:26:32Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] silvercode ACP permission UI integration — bridge connectAcp permissionHandler to PermissionInbox @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]]

Wire silvercode's existing PermissionInbox flow to connectAcp's permissionHandler so ACP-routed sessions get the same allow/deny UI as legacy stream-json sessions.

## Today
acp-controller-wire shipped a v0 permissionHandler that auto-approves the first option ('selected', options[0].optionId). End-to-end usable for codex/pi-acp/gemini smoke tests; wrong as a default for any real use.

## Target
1. Define a per-session PermissionQueue: when connectAcp's permissionHandler is invoked, push a {req, resolver} onto the queue and emit a 'permission-request' AgentEvent the existing UI consumes.
2. Override AcpAgentSession.respondToPermission(requestId, approved) to look up the queued resolver and call it with selected/cancelled.
3. Map approved/denied UI responses to ACP RequestPermissionOutcome variants:
   - approved → { outcome: 'selected', optionId: <chosen> }
   - denied → { outcome: 'cancelled' }
4. Surface the multi-option case (ACP allows 'allow_once', 'allow_always', 'reject_once', 'reject_always') in the UI when a session uses an ACP agent that returns >1 option.

## Acceptance
- bun silvercode --agent codex with a tool call that requires permission triggers PermissionInbox
- Allow → tool runs; Deny → ACP receives 'cancelled' outcome
- Tests: queue dispatch, response routing, multi-option propagation
- v0 auto-approve removed from controller.ts ACP path
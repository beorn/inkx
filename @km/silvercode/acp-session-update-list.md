---
id: "@km/silvercode/acp-session-update-list"
aliases:
  - km-silvercode.acp-session-update-list
  - km-silvercode-acp-session-update-list
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:38Z
closed_at: 2026-04-26T21:03:00Z
close_reason: Closed
started_at: 2026-04-26T20:38:36Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-session-update-list
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T08:37:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-session-update-list
    depends_on_id: km-silvery.diff-code-accordion
    type: blocks
    created_at: 2026-04-26T08:37:56Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] silvercode <SessionUpdateList> — stream container with dividers and retry @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvery/diff-code-accordion]]

Render the ACP `SessionUpdate` stream as a vertical list. Replaces today's flat `MessageList`.

## Maps to ACP
- Each item is one `SessionUpdate` (agent_message_chunk, agent_thought_chunk, user_message_chunk, tool_call, plan, etc.)
- 'Turn' is NOT an ACP concept — silvercode coins `<SessionExchange>` when grouping a user prompt + its agent response stream is needed for visual separation

## Components
- `<SessionUpdateList>` — virtualized list of all updates in a session
- `<SessionExchangeDivider>` — visual separator between a user prompt and the next user prompt (silvercode-only)
- `<SessionRetry>` — inline retry button below a failed exchange (re-emits last user prompt)
- `<SubAgentExchange>` — nested SessionUpdate stream for Task tool with sub-stream

## Today
`apps/silvercode/src/components/MessageList.tsx` — flat row layout, no exchange grouping.

## Estimated LOC: ~500-800

## Deps
- @km/silvery/diff-code-accordion (`<Accordion>` for collapsing long updates)
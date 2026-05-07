---
id: "@km/silvercode/claude-code-transcript-parity/l5-canonical-event-contract"
aliases:
  - km-silvercode.claude-code-transcript-parity.l5-canonical-event-contract
  - km-silvercode-claude-code-transcript-parity-l5-canonical-event-contract
created_at: 2026-05-07T01:20:01.218Z
type: task
priority: P0
status: open
parent: "@km/silvercode/claude-code-transcript-parity"
---

# L5: canonical ChatEvent contract with event.channel as the only routing source #P0

blocks:: [[@km/silvercode/claude-code-transcript-parity]]

## Goal

Make every transcript-affecting fact a strict `ChatEvent` with `event.channel`, and make channel filtering read only that projected field.

## Work

- Keep `AgentEvent` as the adapter/runtime envelope and `ChatEvent` as the validated chat-domain envelope.
- Align names/payloads so simple events pass through with metadata added instead of hand-mapping identical fields.
- Maintain an exhaustive handling matrix for every `ChatEventType`: channel, owner, projection, width, disclosure, detail access.
- Reject unknown event types/properties at parse boundaries.
- Remove direct UI routing based on provider source, raw op shape, or adapter labels.

## Acceptance

- Adding a new `ChatEventType` without matrix coverage fails typecheck or focused tests.
- `visibleChatEvents` / `visibleChatLeaves` filter by `event.channel` / projected leaf channel only.
- Grep for direct transcript filtering by `entry.source`, `op.kind === "raw"`, or `source ===` has zero hits outside documented adapter/notification boundaries.

## Verification

- `bun vitest run apps/silvercode/tests/chat-event-handling.test.ts apps/silvercode/tests/chat-agent-event-normalization.test.ts`
- `rg -n "entry\\.source|op\\.kind === [\"']raw[\"']|kind === [\"']raw[\"']|source ===|muted\\.has\\(e\\.source\\)" apps/silvercode/src apps/silvercode/tests`

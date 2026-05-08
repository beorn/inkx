---
id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/l5-canonical-event-\
  contract"
---

# [/] L5: canonical ChatEvent contract with event.track as the only routing source #P0

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance/parity-claude]]

## Goal

Make every transcript-affecting fact a strict `ChatEvent` with `event.track`, and make track filtering read only that projected field. Protocol/provider channels are normalized before they enter the chat domain.

## Work

- Keep `AgentEvent` as the adapter/runtime envelope and `ChatEvent` as the validated chat-domain envelope.
- Align names/payloads so simple events pass through with metadata added instead of hand-mapping identical fields.
- Maintain an exhaustive handling matrix for every `ChatEventType`: track, owner, projection, width, disclosure, detail access.
- Reject unknown event types/properties at parse boundaries.
- Remove direct UI routing based on provider source, raw op shape, or adapter labels.

## Acceptance

- Adding a new `ChatEventType` without matrix coverage fails typecheck or focused tests.
- `visibleChatEvents` / `visibleChatLeaves` filter by `event.track` / projected leaf track only.
- Grep for direct transcript filtering by `entry.source`, `op.kind === "raw"`, or `source ===` has zero hits outside documented adapter/notification boundaries.

## Verification

- `bun vitest run apps/silvercode/tests/chat-event-handling.test.ts apps/silvercode/tests/chat-agent-event-normalization.test.ts`
- `rg -n "entry\\.source|op\\.kind === [\"']raw[\"']|kind === [\"']raw[\"']|source ===|muted\\.has\\(e\\.source\\)" apps/silvercode/src apps/silvercode/tests`

blocks:: [[@km/silvercode/parity-claude]]

---
mentions:
  - km
id: "@km/silvercode/liveness-deadlock-detector"
aliases:
  - km-silvercode.liveness-deadlock-detector
  - km-silvercode-liveness-deadlock-detector
created_at: 2026-04-30T19:42:49.097Z
type: feature
priority: P0
started_at: 2026-04-30T19:42:49.097Z
closed_at: 2026-04-30T20:00:05.000Z
assignee: codex
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.liveness-deadlock-detector
    depends_on_id: km-silvercode.queue-stuck-thinking-l4
    type: parent-child
    created_at: 2026-04-30T19:42:49.097Z
    created_by: codex
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/queue-st\
      uck-thinking-l4"
---

# [x] Detect silvercode liveness deadlocks @km/silvercode #feature #P0

parent:: [[@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/queue-stuck-thinking-l4]]

## Problem

The 2026-04-30 Codex ACP permission bug showed a gap in Phase A status tracing: the reducer could enter a *valid-looking* `awaiting-permission` state and stay there forever because the ACP bridge resolved the permission promise without emitting the corresponding `permission-decision` event into the store. The existing invariant only catches "busy status without owner"; it does not catch "owned obligation never closes."

## Design

Add a liveness detector that treats long-lived obligations as first-class runtime facts:

- `permission-request(requestId)` opens a permission obligation.
- `permission-decision(requestId)` closes it.
- `tool-use(id)` opens a tool obligation.
- `tool-result(id)` closes it.
- `turn-start(turnId)` opens a turn obligation.
- `turn-end(turnId)` / session end closes it.

Detection policy:

- Keep the detector additive and pure in `session-reducer.ts` until the L4 derived-status refactor lands.
- Emit a normal `lastError` when a pending obligation exceeds a threshold, so the UI/toasts surface it without a new rendering path.
- Use one-shot reporting per obligation id to avoid log/error spam.
- Make thresholds configurable for tests through an explicit reducer action rather than fake timers or wall-clock sleeps.
- Do not silently ignore unknown state: a stale `awaiting-permission` with no permission entry, or a pending permission past threshold, is an error surface.

Target longer-term architecture:

- Phase B/C of [[@km/silvercode/agent-host-l5/02-runtime-kernel-and-turn-owner/queue-stuck-thinking-l4]] should replace stored status with derived status from the obligation sets.
- Fuzz/property tests should generate event sequences and assert these invariants:
  - no `status === "awaiting-permission"` when permission set is empty
  - no `status === "tool-running"` when tool set is empty
  - no active turn after terminal lifecycle events
  - every obligation either closes or produces a liveness error by threshold

## Implementation Slice

Ship now:

- Add `liveness-check` AgentEvent.
- Track first-seen timestamps for active permissions, tools, and turns in reducer-private state.
- On `liveness-check`, surface errors for stale obligations.
- Unit tests cover the exact class: permission request accepted nowhere / missing decision becomes visible as an error instead of a silent deadlock.

Acceptance:

- `apps/silvercode/packages/agent-harness/tests/liveness-detector.test.ts` proves stale permission/tool/turn obligations surface errors and closed obligations do not.
- `bun vitest run apps/silvercode/packages/agent-harness/tests/liveness-detector.test.ts apps/silvercode/packages/agent-harness/tests/status-trace.test.ts apps/silvercode/packages/agent-harness/tests/acp-client.test.ts` passes.

## Closure

Implemented reducer liveness obligations, Codex resume strict replay/order/incomplete-tool handling, shared activity grouping, ambient aggregation, account sidebar selection, and shell failure rendering.

Evidence:

```bash
bun vitest run apps/silvercode/tests/side-panel-multi-account.test.tsx apps/silvercode/tests/tool-call-rendering-v2.test.tsx apps/silvercode/tests/turn-activity-summary.test.tsx apps/silvercode/tests/ambient-event-row.test.tsx apps/silvercode/tests/mute-state.test.ts apps/silvercode/tests/codex-resume.test.ts apps/silvercode/tests/autolinks-osc8.test.tsx apps/silvercode/packages/agent-harness/tests/liveness-detector.test.ts apps/silvercode/packages/agent-harness/tests/status-trace.test.ts apps/silvercode/packages/agent-harness/tests/acp-client.test.ts
```

Result: 10 files passed, 119 tests passed.

- Phase B/C of [[@km/silvercode/queue-stuck-thinking-l4]] should replace stored `status` with derived status from the obligation sets.

parent:: [[@km/silvercode/queue-stuck-thinking-l4]]

```bash
bun vitest run apps/silvercode/tests/side-panel-multi-account.test.tsx apps/silvercode/tests/tool-call-rendering-v2.test.tsx apps/silvercode/tests/chat-message-summary.test.tsx apps/silvercode/tests/ambient-event-row.test.tsx apps/silvercode/tests/mute-state.test.ts apps/silvercode/tests/codex-resume.test.ts apps/silvercode/tests/autolinks-osc8.test.tsx apps/silvercode/packages/agent-harness/tests/liveness-detector.test.ts apps/silvercode/packages/agent-harness/tests/status-trace.test.ts apps/silvercode/packages/agent-harness/tests/acp-client.test.ts
```


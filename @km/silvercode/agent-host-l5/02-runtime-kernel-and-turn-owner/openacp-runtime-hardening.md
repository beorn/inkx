---
aliases:
  - km-silvercode.openacp-runtime-hardening
  - km-silvercode-openacp-runtime-hardening
created_at: 2026-05-08T03:59:25.130Z
---

# [/] OpenACP-inspired Silvercode runtime hardening: event taxonomy, lifecycle machines, queue authority #feature #P1

Architectural follow-up from reviewing OpenACP at 8cd7617 vs Silvercode.

blocks:: [[@km/silvercode]]

Goal: graft OpenACP-style runtime rigor onto Silvercode without copying OpenACP's god-core shape. Highest value focus is explicit event taxonomy, lifecycle state machines, and authoritative queue semantics.

Scope:

- Define a small Silvercode runtime-event taxonomy that distinguishes interceptable pipeline hooks, observable lifecycle facts, and UI projection events. Keep @agentclientprotocol/sdk quarantined behind acp-boundary.ts/acp-types.ts.
- Add explicit lifecycle transition tables for session, connection, turn, and permission ownership where state is currently implied by controller/store side effects. Illegal transitions should be caught by tests or dev invariants.
- Move prompt queue ownership toward an authoritative queue module: queue mutation emits the queue event synchronously with accurate depth/ids; UI/projection consumes queue facts rather than deriving from nearby async controller state.
- Add late-attach/replay semantics where useful: command/config updates and current lifecycle state should be replayable to newly attached projections/viewers without re-running agent logic.
- Add a provider-event repair/enrichment layer beside acp-boundary.ts for tool-update stitching, rawInput preservation, config/command replay, diff stats, and provider quirks. Do not spread provider-specific compatibility logic into components.
- Consider a bounded SessionEventStream abstraction (monotonic event ids, subscribe/replay API, replay-gap handling) if it naturally falls out of the implementation. Remote/SSE transport itself is optional for this bead unless needed to prove the abstraction.

Acceptance criteria:

- New tests cover the event taxonomy boundary: pipeline/intercept events are not confused with observable facts or chat projection events.
- Transition-table tests cover legal/illegal session, connection, turn, and permission transitions, including cancellation, resume, errors, and terminal states.
- Queue tests prove concurrent prompt submissions emit exactly one authoritative queued/running/done sequence per prompt with correct queue depth and stable prompt ids.
- Late-attach/replay tests prove a projection/viewer receives current commands/config/lifecycle state without duplicated transcript/tool events.
- Compatibility tests prove tool_update without rawInput still renders/enriches using cached tool_call input, and terminal tool states clean up caches.
- Existing fast Silvercode tests still pass for touched areas: targeted bun vitest command(s) plus npx tsc --noEmit.

Non-goals:

- Do not rewrite Silvercode into OpenACP's OpenACPCore/service-registry architecture.
- Do not add a remote daemon/SSE product surface unless a minimal event-stream abstraction needs a proof harness.
- Do not move UI components onto raw ACP SDK types.


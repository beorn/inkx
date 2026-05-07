---
topic: "public-api"
date: 2026-05-07
arch_agent_report: "ADOPTED: export the strict AgentEvent validator from the agent-harness public API so runtime and UI layers share one boundary schema."
verdict: "ADOPTED"
---

# Arch retro - agent-harness AgentEvent schema public API

## Bundle path

Lead-only narrow retro for the public API gate triggered by
`apps/silvercode/packages/agent-harness/src/index.ts`.

## Canonical docs the lead actually read

- `docs/architecture.md:29-33` - one writer per signal; derived state should pull from a single owner instead of syncing parallel stores.
- `docs/architecture.md:102-113` - UI-facing trees are derived projections over stable source identity.
- `docs/architecture.md:173-180` - app code can import from lower layers; packages expose the boundary surfaces.
- `docs/principles.md:741-742` - each concept should have one canonical type; parallel definitions are a smell.
- `docs/principles.md:947-1036` - Alignment and pass-through shape: adjacent layers share names and payload shapes where semantics match; adapters enrich and validate rather than rebuilding identical fields.
- `docs/principles.md:1344-1386` - validate at public API boundaries and throw on internal invariants.
- `docs/principles.md:1527-1535` - package users should import from the package public API, with exports through `index.ts`.
- `docs/lessons/refactoring.md:138-168` - shims and compatibility adapter layers keep migrations incomplete; fix callers to the new surface.
- `docs/lessons/op-signal-boundary.md:23-33` - one owning store/boundary should perform the pure transition before reactive propagation.

## Close-reasons the lead actually read

- `@km/silvercode/acp-foundation` - closed: "Legacy AgentEvent surface preserved for gradual migration. Commit: 8fd218cb6."
- `@km/silvercode/acp-fake` - closed: "Fixtures are JSON-as-AgentEvent. For Layer 2, fixtures will need to be migrated..."
- `@km/silvercode/acp-session` - closed: "Factory returning {id, messages, toolCalls, plan, planTree, mode, usage, prompt(), cancel()} as alien-* reactive primitives. Drains the 11 SessionUpdate variants into typed signals (alien-projections for toolCalls keyed by ToolCallId, alien-trees for Plan.entries, signals for the rest). Capability-gates as signals so UI components can declaratively mount/unmount. promptTurn(session, content) returns alien-resource for cancellable async. UI never sees raw SessionUpdate switches outside the adapter."
- `@km/silvercode/queue-stuck-thinking-l4` - closed: "Phase A is implemented via `setStatus()`, `statusTrace`, owner invariants, and liveness obligations in the agent-harness reducer."
- `@km/silvercode/agent-backend-provider-specs` - closed: "Implemented provider-injected fake ACP backends, reactive chat/session store, fake/live backend spec runner, comprehensive fake ACP prompt stream from local transcript shape survey, and backend contract specs for prompt/config/comprehensive session updates."

## Current code state

- `apps/silvercode/packages/agent-harness/src/events.ts` defines the `AgentEvent` union emitted by all backends.
- `apps/silvercode/packages/agent-harness/src/session-store.ts` is the package boundary that accepts live `AgentEvent`s and applies them to the reducer.
- `apps/silvercode/packages/agent-harness/src/event-schema.ts` adds a strict Zod parser for the existing `AgentEvent` shape.
- `apps/silvercode/packages/agent-harness/src/index.ts` exports `agentEventSchema` and `parseAgentEvent` so UI projection code imports the package boundary instead of duplicating schemas or deep-importing internals.
- `apps/silvercode/src/chat/normalize-agent-event.ts` consumes `parseAgentEvent` from `@km/agent-harness`, keeping `AgentEvent => ChatEvent` projection aligned with the harness boundary.

## Contradictions found

- `docs/lessons/refactoring.md` warns against re-export shims. This export is not a compatibility shim: it exposes the canonical validator next to the canonical type so downstream projection code has one source of truth.
- `docs/principles.md` says validate at public boundaries. The harness store validates at ingestion; the UI projection also validates unknown replay/local input by calling the same public validator. This is two callers of one boundary schema, not two independent validators.

## Reversal check

- [x] No reversal

## Verdict

ADOPTED. Export `parseAgentEvent` and `agentEventSchema` from
`@km/agent-harness`. This makes strict AgentEvent validation a real package
surface and supports the pass-through/alignment rule: simple fields remain
named the same from `AgentEvent` to `ChatEvent`, while semantic projection
adds `channel`, `id`, and `rawRefs`.

## Effort estimate

Small public API addition, but foundational to the transcript refactor. The
risk is strict validation surfacing existing malformed synthetic test events;
that is intentional and should be fixed at the fixture/source boundary rather
than hidden in UI projection.

## Beads to file before max can run

- Existing scope: `@km/silvercode/claude-code-transcript-parity` tracks the L5 transcript/event projection work and should remain the parent issue.

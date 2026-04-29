---
id: "@km/silvercode/acp-status-as-derived"
aliases:
  - km-silvercode.acp-status-as-derived
  - km-silvercode-acp-status-as-derived
created_by: claude:cc081a9a
created_at: 2026-04-27T22:47:03Z
started_at: 2026-04-28T00:26:18Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.acp-status-as-derived
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T15:47:07Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [/] Reframe: silvercode status as derived signal (L3→L4) @km/silvercode #feature #P2 @claude:cc081a9a

blocks:: [[@km/silvercode]]

**Reframing from /big — 2026-04-27** (parent bead @km/silvercode/claude-acp-wire-bugs).

## The real problem

silvercode's `session-store` stores `status: "spawning" | "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"` as an FSM driven by explicit lifecycle AgentEvents (`turn-start`, `turn-end`, `permission-request`, `tool-use`, `tool-result`, etc.). The ACP wire model is implicit — `agent.prompt(...)` returns a promise; its settlement IS the turn boundary. Every translation point in `acp-client.ts:mapSessionUpdateToLegacyEvents` and the call-site lifecycle bookkeeping is a place to forget, mistime, or misroute an event.

Three bugs shipped in 2 days:
- 2026-04-25: `send()` discarded PromptResponse → no turn-end → 98% CPU loop (@km/silvercode/thinking-loop-after-bash)
- 2026-04-27 morning: `prompt()` had the same bug → "Refining…" stuck indefinitely (`26ae480fc`)
- 2026-04-27 afternoon: `prompt()` rejection branch ALSO had the same bug → today's user-reported recurrence (`2d5fbc555`)

Each fix was duct tape on the same wound. The lifecycle helper (`withTurnLifecycle`, this commit) centralizes the pattern at L3, but the FSM itself is still the source of fragility.

## Current → target

L3 (helper makes the right thing the easy thing) → L4 (architecture makes the wrong thing impossible).

## The reframe

Replace stored `state.status` with a **derived signal** computed from observable wire state:

```ts
// In session-store / acp-session
const inFlightPrompts = signal(new Set<TurnId>())
const status = computed<Status>(() => {
  if (closed()) return "ended"
  if (initializing()) return "spawning"
  if (pendingPermissions().length > 0) return "awaiting-permission"
  if (activeToolCalls() > 0) return "tool-running"
  if (inFlightPrompts().size > 0) return "thinking"
  return "idle"
})
```

The wire's actual lifecycle drives the signal. There is no event to forget because there is no event — the prompt promise's pending state IS the source of truth. Settlement (resolve OR reject) automatically transitions to idle.

## What it solves beyond the immediate bugs

- Future ACP adapters (gemini, copilot, pi-acp) inherit correct status without re-implementing the FSM
- Cancellation + partial-failure paths get correct status without bespoke handling
- Test surface — derived signals are observable in tests; FSM transitions are not
- Composable with `@silvery/scope` — turn lifecycle = scope lifetime
- Eliminates the cognitive overhead of "did I remember to fire turn-end here?" — there's nothing to fire

## Effort

Phased:

**Phase 1** — additive: introduce `derivedStatus` signal alongside the existing FSM. Both surfaces present. New components consume `derivedStatus`; old components keep reading `state.status`. (1 session, low risk)

**Phase 2** — migrate consumers one-by-one. SidePanel, SessionPromptComposer, ActivityIndicator, the "Refining…" timer. (1-2 sessions)

**Phase 3** — delete `state.status` + the FSM transitions in `session-store.ts`. Delete the `withTurnLifecycle` helper's turn-end emission (no consumer left). (1 session)

**Phase 4** — property test: fuzz fake ACP server emits random valid sessionUpdate sequences; assert `derivedStatus` converges to idle within 100ms of every prompt resolve. (1 session)

## /complete acceptance

- `grep "state.status" apps/silvercode/` → 0 hits outside session-store internal
- `grep "kind: \"turn-end\"" apps/silvercode/packages/agent-harness/src/` → 0 hits (no synthesis needed once status is derived)
- Property test in `tests/turn-lifecycle.fuzz.test.ts` passes 1000 iterations
- All existing tests pass

## First step (when ready to start)

Add `derivedStatus` signal in `acp-session.ts` (the new ACP-shaped store) without removing the FSM yet. Wire one consumer (e.g., the Composer's "Refining" indicator) to it. Verify it tracks correctly under live load. THEN start Phase 2.

## Cross-refs

- Parent: @km/silvercode/claude-acp-wire-bugs (immediate-fix bead, this reframe is the long-term cure)
- Related: @km/silvercode/thinking-loop-after-bash (closed; first occurrence of the class)
- Related: hub/silvery/design/lifecycle-scope.md (Scope = AsyncDisposableStack pattern; turn-as-scope composes here)
---
id: "@km/silvery/interactions-runtime/phase-2/5-coordinator"
aliases:
  - km-silvery.interactions-runtime.phase-2.5-coordinator
  - km-silvery-interactions-runtime-phase-2-5-coordinator
created_by: Bjørn Stabell
created_at: 2026-04-06T07:21:02Z
closed_at: 2026-04-06T07:22:30Z
---

# [x] Phase 2.5: Coordinator + render invalidation + capability registry (shared infra) @km/silvery #task #P1

Create the shared infrastructure that all feature phases need: input router, overlay registry, render invalidation hook, and a capability registry for symbol-keyed cross-provider communication. Land this BEFORE any feature integration so later phases don't retrofit.

Per Pro review 2, this is split from Phase 3 to reduce first-landing risk and make the coordinator its own architecturally-reviewable unit.

## Key decision: coordinator lives in @silvery/create, not @silvery/ag-term

Per Pro review 2 item 4: the coordinator's consumers are with-dom-events and with-focus (both in @silvery/create). Placing it in ag-term creates a package-boundary smell (create → ag-term coupling for runtime composition). Runtime composition belongs in create.

New location: vendor/silvery/packages/create/src/internal/input-router.ts

This is internal — not exported from create's public barrel.

## Responsibilities

### Input router (vendor/silvery/packages/create/src/internal/input-router.ts)

- Register mouse/key handlers with explicit priority
- Register overlay renderers with explicit priority
- Dispatch events in priority order
- Handler 'claim' semantics (like DOM stopPropagation)
- Deterministic tie-breaker when priorities equal (registration order — document this)
- Minimal API, not a grand abstraction

### Render invalidation hook

A critical missing piece per Pro review. Selection state change must trigger a new output pass without any React/store state change. Otherwise: 'machine state changes, tests pass, nothing visibly updates.'

Design:
- Router exposes invalidate() method
- Features call it when their state changes
- with-dom-events / with-render / create-app wires invalidate() to the runtime render loop
- Feature state → router.invalidate() → runtime schedules next output pass

Steal the existing pattern from focus manager if possible (focus changes already trigger rerenders — how? investigate and reuse).

### Capability registry (symbol-keyed)

Per Pro review item 11C: services should be internal capabilities, not public app fields.

  const SELECTION = Symbol('silvery.selection')
  
  // Feature registers:
  router.registerCapability(SELECTION, selectionFeature)
  
  // Other features read:
  const selection = router.getCapability(SELECTION)
  if (selection) selection.setRange(...)

This keeps the public app shape clean while allowing cross-feature communication.

## Files

CREATE:
- vendor/silvery/packages/create/src/internal/input-router.ts (~150 lines)
- vendor/silvery/packages/create/src/internal/capability-registry.ts (~40 lines — could be inlined into input-router)
- vendor/silvery/tests/internal/input-router.test.ts — priority + claim + tie-breaker + invalidation
- vendor/silvery/tests/internal/capability-registry.test.ts — register/get/idempotent

UPDATE:
- vendor/silvery/packages/create/src/index.ts — DO NOT export internal/* from public barrel. Internal imports are via subpath.

## Delete

Nothing.

## New tests

4 unit tests in vendor/silvery/tests/internal/:
1. input-router.test.ts — priority ordering, handler claim, tie-breaker (registration order), invalidate() is called
2. capability-registry.test.ts — register, get (returns capability), get (returns undefined if not registered), re-register (idempotent or last-wins — pick one and test it)

Plus ONE integration gate:
3. input-router-invalidation.integration.test.ts — a minimal runtime with a mock feature; feature calls router.invalidate(); runtime's output pass is triggered without any app state change

## Definition of Done

- [ ] input-router.ts exists in create/src/internal/
- [ ] capability-registry.ts exists (or inlined) in create/src/internal/
- [ ] Router has register/dispatch/claim/invalidate/tie-breaker
- [ ] Invalidate hook wires to runtime output scheduling
- [ ] 2 unit tests + 1 integration test pass
- [ ] internal/ is NOT exported from create's public barrel
- [ ] tsc 0 new errors

## /complete criteria

- test -f vendor/silvery/packages/create/src/internal/input-router.ts
- test -f vendor/silvery/packages/create/src/internal/capability-registry.ts
- grep -q 'invalidate' vendor/silvery/packages/create/src/internal/input-router.ts
- grep -q 'claim\|consume' vendor/silvery/packages/create/src/internal/input-router.ts
- grep -q 'priority' vendor/silvery/packages/create/src/internal/input-router.ts
- test -f vendor/silvery/tests/internal/input-router.test.ts
- test -f vendor/silvery/tests/internal/capability-registry.test.ts
- test -f vendor/silvery/tests/internal/input-router-invalidation.integration.test.ts
- bun vitest run vendor/silvery/tests/internal/ → all pass
- grep 'internal/input-router' vendor/silvery/packages/create/src/index.ts → 0 hits (not exported publicly)
- cd vendor/silvery && npx tsc --noEmit → 0 new errors

## Behavior-based gates (beyond greps)

- Register two handlers at same priority → tie-breaker documented behavior holds
- Register handler, call invalidate() → runtime output pass is scheduled (observable side effect)
- Register overlay at priority 100, another at 50 → dispatched in correct order
- Get capability before register → undefined
- Get capability after register → the registered object

## Risks

1. **Wiring invalidate() to runtime** — need to identify the runtime's existing render-trigger mechanism. Likely via the same mechanism focus-manager uses. Investigate first.
2. **Tie-breaker choice**: registration order vs declaration order vs alphabetical. Pick registration order (most predictable), document it.
3. **Capability registry scope** — do capabilities live per-app, or global? Per-app (each createApp gets its own).

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.
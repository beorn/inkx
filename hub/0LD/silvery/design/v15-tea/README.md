# v15-tea archive

Design artefacts from the apply-chain prototype that have since shipped
as production code. Kept for historical reference; do NOT import these
files — the live code is in `vendor/silvery/`.

## plugin-system-v1r.ts

The 427-line executable prototype that validated the apply-chain
contract (plugins wrap `apply()`, `apply()` returns `false | Effect[]`,
`dispatch()` drives the chain and drains effects).

**Shipped as**: `vendor/silvery/packages/create/src/runtime/` —
specifically:

- `base-app.ts` — the `create()` base + `wrapApply()`
- `with-terminal-chain.ts` — observer lane + resize/focus lifecycle
- `with-input-chain.ts` — fallback useInput store
- `with-paste-chain.ts` — focused-route + global paste handlers
- `with-focus-chain.ts` — focused-element key dispatch
- `event-loop.ts` — `runEventBatch` (the functional processEventBatch)
- `lifecycle-effects.ts` — Ctrl+C / Ctrl+Z as typed Effects

Differences from the prototype:

1. Dispatch effect shape is `{type:"dispatch", op:Op}` (explicit
   nesting) rather than the prototype's `{type:"dispatch", ...op}`
   (spread-then-check), which the prototype demo silently mis-routed
   because the spread overrode the discriminator.
2. `drainEffects()` was added so the runner can pull non-dispatch
   effects (render / exit / suspend / render-barrier) after the
   internal dispatch-queue drain completes.
3. Each plugin ships with 8–13 tests locking in its semantics; the
   prototype was demonstrated only via a single `demo()` script.

Re-read the tests under `packages/create/tests/` for the current
contract — they are the authoritative spec.

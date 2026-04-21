# Silvery Authoring Elegance Review — 2026-04-21 (Cycle 1)

**Reviewer:** claude (session 54bda87b) with GPT-5.4 Pro
**Bead:** `km-silvery.authoring-elegance` (P0, under `km-all.plateau`)
**Template:** [elegance-review-template.md](elegance-review-template.md)
**Next cycle date:** 2026-05-21 (monthly cadence)

---

## Context — what was measured

First cycle of the monthly elegance review. Two real plugins exist as primary evidence:

| Plugin | Files | LOC | Ops | State fields | Role |
|---|---|---|---|---|---|
| **HelpOverlay** (Phase 0 mini-cutover) | 3 | 296 | 4 | 2 | simplest-possible dialog |
| **SearchDialog** (Phase 1 real validator) | 3 | 417 | 5 | 4 | hard case — text input, focus scope, multi-slice close |

Measured via `wc -l` on:

- [`apps/km-tui/src/plugins/with-help-overlay.ts`](../../apps/km-tui/src/plugins/with-help-overlay.ts) — 213 LOC
- [`apps/km-tui/src/plugins/use-help-overlay.ts`](../../apps/km-tui/src/plugins/use-help-overlay.ts) — 23 LOC
- [`apps/km-tui/src/plugins/HelpOverlayBridge.tsx`](../../apps/km-tui/src/plugins/HelpOverlayBridge.tsx) — 60 LOC
- [`apps/km-tui/src/plugins/with-search-dialog.ts`](../../apps/km-tui/src/plugins/with-search-dialog.ts) — 221 LOC
- [`apps/km-tui/src/plugins/use-search-dialog.ts`](../../apps/km-tui/src/plugins/use-search-dialog.ts) — 24 LOC
- [`apps/km-tui/src/plugins/SearchDialogBridge.tsx`](../../apps/km-tui/src/plugins/SearchDialogBridge.tsx) — 172 LOC

Bridge files carry all feature-flag + react-adapter code. Plugin files themselves grew only +4% when op count +25% and state-field count +100% — plugin-body boilerplate scales well. **Bridges do not.**

---

## Scores (out of 10)

### 1. Authoring ergonomics — 4/10

- Three files for the simplest plugin (target: 1).
- 213 LOC for HelpOverlay, 83% of which is structural (types / store / singleton / feature-flag). Only ~28 LOC is the `apply` reducer that expresses actual intent.
- "Minimum viable plugin ≤50 LOC" criterion: **FAILING**. HelpOverlay is 4.3× target. SearchDialog is 4.4× target.
- Every plugin author hand-rolls the same 40-LOC `createStore({ getState, dispatch, subscribe, reset })` block — prime factory extraction target.
- Singleton pattern forces per-plugin `resetXxxStore()` for test isolation — mechanical, repeated, error-prone.

### 2. Type safety — 6/10

- Ops ARE a discriminated union (`SearchOp = { type: "search.show"; … } | …`) — TS catches invalid `type` literals on construction.
- `apply(op: SearchOp, state: SearchState): [SearchState, SearchEffect[]]` — discriminated type narrowing in the switch is exhaustive via TS's `never` check.
- BUT: effect namespacing is hand-typed (`"search.show"`, `"search.hide"`, …). No mechanical guarantee the `name` ("search") and the string literals stay in sync.
- No `definePlugin` factory ⇒ no type-level `pipe(withA, withB)` ordering enforcement. Precedence bugs surface at runtime today, caught by integration tests.
- Zero `as` casts in either plugin body (grep confirmed). Consumer side is also cast-free.
- Criteria 2 (types flow without string namespacing) and 3 (precedence bugs at pipe-time): **PARTIAL / FAILING**.

### 3. Composition clarity — 5/10

- Both plugins currently compose via the **legacy dual-write pattern**, not via silvery's `pipe()`. The cutovers are additive mirrors of `setUI`; there is no real pipe-composition test between them yet.
- Precedence rules are documented in [tea-review-responses.md](tea-review-responses.md) but not reflected in the type system.
- Role lanes (observer / targeted / global / fallback / middleware) are proposed but not implemented — pipe order today is positional, not semantic.
- Failure mode when one plugin breaks another: silent — no runtime guard for "observer consumed op."

### 4. Debugging surface — 6/10

- Pure `apply(op, state) → [state, effects]` signature is trivially testable and replayable. HelpOverlay ships 20 reducer unit tests; SearchDialog ships 20 + 23 parity + 4 termless. Strong.
- No trace log today. When a key press does nothing, there is no structured "which plugin saw this op and did what" output.
- Every plugin uses `process.env.KM_TEA_*` directly — debugging state-sources requires grepping env vars.
- The feature-flag pattern is diagnostic-friendly (parity tests exercise both paths) but not self-evident from a single plugin file.

### 5. Adoption readiness — 3/10

- No external developer could build a plugin from docs today — the docs don't exist. Template + cutover verdicts live in `hub/silvery/` (private).
- The 40-LOC hand-rolled store, the singleton leak, the dual-write pattern, and the bridge file are all non-obvious and would have to be copy-pasted from another plugin.
- A 3-person startup choosing between `Ink + Zustand + React` and `silvery + current plugin API` would pick Ink+Zustand every time — the current plugin API is heavier with no corresponding benefit visible to a newcomer.
- Criterion 6 (comparable to Solid / Zustand / SwiftUI): **FAILING**. Zustand ships the minimum-viable store in ~20 LOC. Solid ships a reactive signal in 3 LOC. Both do more, with less ceremony.

### 6. Falsifiable quality gates

| Gate | Target | Actual | Pass? |
|---|---|---|---|
| Minimum viable plugin LOC | ≤50 | 296 (HelpOverlay, 3 files) / 213 (plugin file alone) | FAIL |
| Zero `as` casts in plugin code | 0 | 0 | PASS |
| Zero string-literal effect namespacing | 0 | 9+ (`"help.show"`, `"search.show"`, …) | FAIL |
| `pipe(wrongOrder)` produces type error | Yes | No (pipe not enforced at type level) | FAIL |
| External dev builds plugin from docs in <2h | Yes | Untested — no public docs | N/A |

**Overall score: 4.7/10** — functional, testable, not yet adoptable.

---

## Compared to prior art

- **vs Zustand** — _worse_ at single-file simplicity. Zustand ships `create((set) => ({count: 0, inc: () => set(s => s + 1)}))` in one line + one line of `useStore(store, s => s.count)`. silvery requires 3 files (plugin, hook, bridge) for equivalent surface. _Same_ at subscription semantics (both use `useSyncExternalStore`).
- **vs Solid Signals** — _worse_ at reactivity ergonomics. Solid's `createSignal(0)` has zero per-component boilerplate. silvery's `useSyncExternalStore` wrapper is ceremony by comparison. Solid also has zero "plugin" taxonomy, and thrives for it.
- **vs Redux + Redux-Saga** — _better_. silvery ops are a discriminated union with exhaustive switch, not `{ type: "FOO", payload: any }`. Reducer inversion (effects out, not dispatch in) beats saga generators for testability.
- **vs Slate.js plugins** — _better_ on type safety, _same_ on plugin-chain obscurity. Slate's plugin chain is famously confusing because normalize/decorate/onKeyDown/onChange have no explicit precedence contract. silvery has the same issue latent — role-lanes would address, but Slate is a cautionary tale against over-taxonomizing.
- **vs SwiftUI / TCA** — _worse_ at ergonomics, _arguably same_ at architecture. TCA's `Reducer` type + `@Dependency` property wrappers give composition without factory verbosity. SwiftUI itself has no plugin system — composable views do the work. silvery's plugin indirection is justified by runtime replay + AI automation, but the surface looks heavier than TCA's.

---

## Target: `definePlugin({...})` worked example

Reimagining HelpOverlay against the sketch in the bead:

```ts
// ============= proposed — one file, <50 LOC =============
import { definePlugin } from '@silvery/create'

export const helpOverlay = definePlugin({
  name: 'help',                                          // namespace auto-derived
  state: { visible: false, scrollOffset: 0 },            // type inferred
  ops: {
    show:       (s) => ({ visible: true, scrollOffset: 0 }),
    hide:       (s) => ({ visible: false, scrollOffset: 0 }),
    toggle:     (s) => s.visible
                  ? { visible: false, scrollOffset: 0 }
                  : { visible: true,  scrollOffset: 0 },
    scrollUp:   (s) => s.visible ? { ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) } : s,
    scrollDown: (s) => s.visible ? { ...s, scrollOffset: s.scrollOffset + 1 } : s,
  },
  keys: { '?': 'toggle', Escape: 'hide', k: 'scrollUp', j: 'scrollDown' },
})

// Consumer:
// const { visible, scrollOffset } = useStore(helpOverlay)
// helpOverlay.dispatch({ type: 'help.toggle' })   // type-narrowed, autocompleted
```

**Measured target**: ~20 LOC for the plugin, 0 LOC for a hook (factory returns a `useStore`-compatible handle), 0 LOC for a bridge if the `keys:` shorthand is honored by a `withKeys()` convention plugin.

### What the framework has to ship to make this work

1. `definePlugin<State, Ops>({...})` factory that:
   - Infers `State` from `state:` initializer
   - Infers op union from `ops:` keys + optional payload types
   - Auto-namespaces op types (`${name}.${opKey}`) — no manual string literals in user code
   - Returns an object with `.dispatch(op)`, `.getState()`, `.subscribe()`, `.reset()` already wired (zustand-shape)
2. `useStore(plugin)` React hook (one-import replacement for the `useXxx.ts` file)
3. `keys: {...}` shorthand — processed by a `withKeys(plugin)` higher-order plugin that registers key bindings with whatever key-routing plugin sits upstream
4. Optional `effects: (s, op) => Effect[]` escape hatch for ops that need to return non-empty effects (today's `[state, effects]` tuple pattern) — NOT required in common case
5. **NO** `role:` tag at the factory level for now — see pro verdict below

### Honest delta vs reality

- The 40-LOC hand-rolled store goes away (factory subsumes it).
- The feature-flag reader goes away (the plugin is either in the pipe or not — composition replaces runtime branching).
- The bridge file stays but shrinks dramatically when `useStore(plugin)` is the one-line hook (60→~15 LOC for HelpOverlay).
- Dialog-wrapper chrome (focus scope, centerdialog positioning) is NOT plugin boilerplate — it is km-tui concern and stays. This is ~100 LOC of SearchDialogBridge's 172 LOC.

Realistic: HelpOverlay at **~35 LOC total** (plugin 20 + bridge 15). SearchDialog at **~80 LOC total** because of legitimate dialog-chrome concerns. Criterion 1 (≤50 LOC for simple plugins) achievable for HelpOverlay; **borderline** for SearchDialog depending on whether the dialog-chrome is library or app concern.

---

## /pro Review — GPT-5.4 Pro verdict

**Context passed**: silvery positioning brief + full source of both plugins + definePlugin sketch + role-lanes excerpt from [tea-review-responses.md](tea-review-responses.md). Mode: `gpt-5.4-pro` fast (self-sufficient context, ~$1-3).

_[PRO_VERBATIM_BLOCK]_

---

## What's worth shipping now

1. **`definePlugin({...})` factory** — the single highest-leverage unlock. Collapses the 3-file pattern to 1 file; eliminates the 40-LOC store boilerplate; removes manual op-type string namespacing. Bead: `km-silvery.definePlugin`.
2. **`useStore(plugin)` hook** — bundled with `definePlugin`. Replaces every hand-rolled `useXxx.ts` bridge file. Bead folded into `km-silvery.definePlugin`.
3. **Keep `role:` out of v1 of definePlugin** — document role-lanes as *policy* via pipe-ordering, not as a type-level tag. Revisit if and only if a real precedence bug survives discipline. Bead: `km-silvery.role-lanes-decide` — explicit _defer_ decision.
4. **Public plugin-authoring doc** — walk a developer through HelpOverlay from scratch, using `definePlugin`, without referencing any km-internal concept. Target: <2h onboarding. Bead: `km-silvery.plugin-authoring-doc`.
5. **Lint rule: ban manual `"${name}.${op}"` string literals outside `definePlugin`** — enforces that the namespace lives in one place. Bead: `km-silvery.plugin-namespace-lint`.

---

## What to defer

- **Role-lanes (`km-silvery.tea-role-lanes`)** — already P3. Keep deferred. Zustand and Solid prove ceremony-free composition works; role-lanes risk Slate-style obscurity. Re-evaluate at Cycle 3 if concrete precedence bugs appear that discipline can't prevent.
- **Composite ops + state-delta convention (`tea-composite-ops`, `tea-state-delta-convention`)** — Phase 6 (undo) concerns, not authoring concerns. No elegance gain for the definePlugin surface.
- **Generic `withDialogs()` plugin** — Phase 1 concern. Premature until we have a third dialog cutover to confirm the pattern generalizes.
- **`passThrough` / `consumed()` helpers (`tea-apply-helpers`)** — already P2. Keep deferred; today's reducers don't need them because the dual-write pattern sidesteps the `[] vs false` question. Revisit when the first plugin legitimately wants pass-through.

---

## Falsifying evidence — where the framework currently forces ugly code

1. **40-LOC `createHelpStore` / `createSearchStore` duplicated between plugins** — verbatim duplication of the zustand-shape store. No plugin author should write this.
2. **Singleton pattern with per-plugin `reset()` exported for tests** — `resetSearchStore`/`resetHelpStore` are wired into `board-test.ts` + `test-app.ts` manually; next plugin needs the same wiring. This is a framework gap.
3. **Feature-flag reader inside the plugin body (`isTeaHelpEnabled()`, `isTeaSearchEnabled()`)** — `process.env.KM_TEA_*` branching is temporary migration scaffolding but has leaked into what would be the "canonical" plugin shape.
4. **`SearchDialogBridge.tsx`'s 172 LOC** — mostly dialog-chrome + legacy-prop bridge. The legacy-prop bridge is migration-only; the chrome is app concern. The bridge as-written conflates both.

---

## ONE concrete test to run before Cycle 2

**Ship `definePlugin({...})` + `useStore(plugin)` as a silvery primitive, and re-cutover HelpOverlay to it.** Measure LOC + compare. Target: HelpOverlay at ≤50 LOC total across all files.

If the factory can replicate every HelpOverlay behavior (toggle, scroll, keybinding) at ≤50 LOC without sacrificing type safety, the framework has crossed the Zustand-parity line. If it can't, we know exactly which primitive is missing (most likely: `keys:` shorthand OR React-bridge factory).

Tracking bead: `km-silvery.definePlugin` (filed this cycle).

---

## Action items — beads filed

1. **`km-silvery.definePlugin`** (P1) — ship `definePlugin({...})` factory + `useStore(plugin)` hook. Re-cutover HelpOverlay. Gate: ≤50 LOC total for HelpOverlay. Blocks cycle-2 elegance review.
2. **`km-silvery.plugin-namespace-lint`** (P3) — ban hand-typed `"${name}.${op}"` literals outside `definePlugin`. Enforces single source of namespace truth. Low effort, high signal.
3. **`km-silvery.plugin-authoring-doc`** (P2) — public doc walking an external dev through HelpOverlay from scratch. Gate: <2h onboarding for one external reviewer.
4. **`km-silvery.role-lanes-decide`** (P3) — explicit _defer_ decision for role-lanes. Record rationale; revisit at Cycle 3 or when concrete precedence bugs demand it.
5. **`km-silvery.plugin-bridge-slim`** (P2) — strip `SearchDialogBridge.tsx` of migration-only code once SearchDialog is the source of truth (no dual-write). Separately document which ~100 LOC is legitimate dialog-chrome and which is migration boilerplate.

---

**Next cycle date: 2026-05-21 (monthly cadence)**

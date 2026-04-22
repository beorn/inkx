# Silvery App Architecture — History

> Prior efforts on this design. Read to understand where we've been when picking up the thread.
> Chronological-ish. Files referenced are pointers — many now archived.

---

## Pre-era2 (early 2026 and before)

Silvery started as "a better Ink" — React + useState + useInput hooks. Apps mutated zustand stores or React state directly. Input flowed through `useInput` hooks registered on components; no central dispatch.

State for complex apps (like km-tui, aichat) grew messy: monolithic reducers (`createDemoUpdate` — 387 LOC in aichat), separate React hooks observing and re-dispatching (`useAutoCompact`, `useAutoExit`, `useKeyBindings`), imperative refs bridging parent and child state (`footerControlRef`). A mesh/star of ambient subscribers, not layered composition.

Related docs, now archived:
- `hub/0LD/silvery/pre-era2/architecture-overview.md`
- `hub/0LD/silvery/pre-era2/state-api-redesign.md`
- `hub/0LD/silvery/pre-era2/focus-routing.md`
- `hub/0LD/silvery/pre-era2/mouse-events-design.md`

---

## Era2 birth — dispatch/apply pipeline (~29 days ago)

Proposed breaking the monolithic runtime into composable plugins via `pipe()`. The framework ships `create()` (zero-dep) + `pipe()`; everything else (rendering, input, app architecture) is opt-in through plugins wrapping `apply(op)`.

First working draft: `plugin-system.ts`. Then an exploration doc introduced state slice composition, apply-chain wrapping, and a tuple-return `[state, effects]` convention for TEA purity.

Related, archived:
- `hub/0LD/silvery/era2-drafts/00-architecture.md` — original dispatch/apply pipeline
- `hub/0LD/silvery/tea-exploration/plugin-system.ts` — first draft
- `hub/0LD/silvery/tea-exploration/ag-event-architecture.md`
- `hub/0LD/silvery/tea-exploration/app.md`

---

## Plugin-system exploration (~28-20 days ago)

Three iterations of the core plugin-system shape were prototyped:

- **v1 (draft)** — apply returns `Effect[]`, plugins wrap and own stores.
- **v2 (superseded 2026-04-11)** — observer/handler split, `"pass"` return instead of identity-based ambiguity, immutable state. Never adopted. `hub/0LD/silvery/tea-exploration/plugin-system-v2.ts`.
- **v1r (refined, shipped as code)** — `apply(op): false | Effect[]`, explicit handled-plus-effects, aligns with `tea()`'s TeaResult. Observer lane runs always. Drain loop + reentry guard in `dispatch`. See `hub/0LD/silvery/design/v15-tea/plugin-system-v1r.ts` (archived after shipping).

v1r became the current silvery runtime at `vendor/silvery/packages/create/src/runtime/base-app.ts` + `with-*-chain.ts`. It then **drifted**: role lanes accumulated (observer/targeted/global/fallback/middleware), a parallel `ag-term/plugins/with-*` family grew for the test harness, `withApp()` accidentally broke closure identity via spread, the `[] vs false` footgun never got its helpers. Beads filed for composite-ops, state_delta convention, role-lanes-as-policy.

---

## Era2 split — 2a (rendering) / 2b (app) (~14 days ago)

Era2 got reframed into two independent eras:

- **Era2a — rendering foundation** (ships first): `create() + withAg() + withTerm() + withReact() + withTest()`. No signals, no commands, no TEA. The "React for terminals" story.
- **Era2b — app architecture** (ships later as silvertea): `withApp() + signals + commands + keymaps + scopes + domain plugins`. Builds on era2a. Opt-in for complex apps.

Key decisions logged in `hub/silvery/reference/decisions.md` (37 entries):
- D26-28: alien-signals as reactive engine
- D29: getter/setter function-call pattern (not `.value`)
- D30: commands are state-agnostic
- D31: `@silvery/tea` dissolves into create + commands + headless
- D34: signals and model are optional (rendering has zero signal deps)
- D36: providers dissolve into plugins (`Pick<typeof app, ...>` for DI)
- D37: era2a/era2b split

Canonical docs born in this split:
- `reference/era2-overview.md` — the map. "Partially stale" header now.
- `design/v10-terminal/app-composition.md` — era2a architecture
- `design/v15-tea/commands.md` — command tree, object references, Zod `.parse()`, projections
- `design/v15-tea/signals.md` — alien-signals wrapper, createModel, createStore, createResource
- `design/v15-tea/headless.md` — pure state machines (SelectList, Readline)

**Era2b's promise** — reference-based commands (`app.commands.task.toggle_done`), nested tree, keymap binds references, models co-located with commands in domain plugins, signals for state, "objects over strings" principle.

---

## Headless experiment (~6 days ago)

Proved that pure state machines (`createMachine`, readline, select-list) can be extracted from React components. 50 tests, all green. `hub/silvery/prototype/headless/`. Validated the era2b Phase 1 claim: components can become thin wrappers over reducer-based headless machines.

---

## tea-nav-spike (~some time ago)

Earlier TEA spike for navigation: `with-board-spike.ts`, `with-commands-spike.ts`, `with-dialog-spike.ts` + phase1/2 tests in `hub/silvery/experiments/tea-nav-spike/`. Validated plugin layering + apply-chain ops for navigation concerns. Design notes in the sibling README.

---

## tea-lifecycle-spike

Lifecycle counters, mount/unmount/remount traces, phase-a/phase-b tests. `hub/silvery/experiments/tea-lifecycle-spike/`. Validated plugin disposal + mount-phase ordering.

---

## definePlugin spike — declarative TEA (~2 days ago)

Elegance review on 2026-04-21 asked: can we collapse the 3-file plugin shape (plugin + hook + bridge) into one declaration? Result: `definePlugin.ts` (~200 LOC) shipped as code at `vendor/silvery/packages/create/src/definePlugin.ts`.

```ts
const helpOverlay = definePlugin({
  name: "helpOverlay",
  state: { visible: false, scrollOffset: 0 },
  ops: {
    show:   (s) => ({ visible: true, scrollOffset: 0 }),
    hide:   (s) => ({ visible: false, scrollOffset: 0 }),
    scroll: (s, n: number) => ({ ...s, scrollOffset: n }),
  },
  keys: { "?": "show", Escape: "hide" },
})
```

Full type inference via `PayloadOf<R>` discriminating on `Parameters` length. Op types auto-derive as `` `${name}.${opKey}` ``. Zustand-shape store underneath. **Deferred** (not yet solved): effect namespace routing, key binding wiring, role lanes, AppPlugin pipe integration.

Spike retrospective: `hub/0LD/silvery/2026-04-21-retrospectives/definePlugin-spike.md` + sibling `elegance-review-2026-04-21.md`, `tea-review-responses.md`.

**Status relative to DESIGN.md**: definePlugin is a decent pattern but stands alone — not integrated with the apply-chain, and not the "object references" shape era2b wants. A useful reference for type inference tricks, but not the target.

---

## pipe-with-composition spike — aichat refactor (~1 day ago, Apr 21)

Tested layering hypothesis against dual-model review (GPT 5.4 Pro + K2.6). Applied `pipe(with*())` + `createSlice` to a real app (aichat). 10 plugins, ~40-80 LOC each, ~375 LOC vs 640 monolithic original.

```ts
pipe(
  createBaseApp(),
  withApp(),
  withScript({ exchanges }),
  withStream({ pulse, speed }),
  withMount({ init }),
  withCompact(),
  withSubmit(),
  withKeys(),
  withAutoExit(),
  withReact(<AIChat />),
)
```

Each plugin wraps `app.apply`, emits `{type:"dispatch", op:...}` effects for cross-plugin messaging, uses `fx.delay/fx.interval/fx.cancel` timer effects. Proved:
- Layered composition is clearer than a mesh
- Ordering errors catchable at compile when plugins declare `<Req, Add>` type bounds
- HelpOverlay lineage: v1 (296 LOC / 3 files) → v2 (33 LOC / definePlugin) → v3 (56 LOC / pipe plugin with cross-plugin dispatch)

Files: `hub/silvery/prototype/pipe-with-composition/{README.md, aichat-composed.tsx, help-overlay.v3.ts}`.

**Status relative to DESIGN.md**: closest prior art to where we want to end up. Still uses `apply(op):Effect[]` — Q3 unresolved.

---

## aichat-v2 prototype (Apr 18)

Earlier TEA apply-chain spike on aichat, ~28kb `app.tsx` + `app.test.ts` + `apply-chain.test.ts` + shims for app/clock/terminal. `hub/silvery/prototype/aichat-v2/`. Tested the full event pipeline against a realistic app before the layered decomposition.

---

## This session (2026-04-22)

Long multi-pivot session. The user asked to simplify the plugin architecture. I walked through:

1. **Chain (v1r)** → **hybrid (chain for framework, factories for features)** — defended for a while, walked back after user observed "focus has state too."
2. **Providers-only** — "everything is a Provider, router and invoker are specialized providers" — also walked back.
3. **Back to `pipe(with*())`** — Slate-style, 4 concepts, 2 seams, no apply-chain `false | Effect[]`, commands as namespaced data instead of Effect[].
4. **Dual /pro review** on Option A (pure factory+compose) vs Option B (hybrid chain + factories). Both GPT 5.4 Pro and Kimi K2.6 picked B unambiguously. Cost $2.48, 440s.
5. **But user pivoted again** — recognized providers conflict with plugins; I re-proposed "everything is a provider"; user pushed back.
6. **Canonical vs minimal** — user asked for two prototypes (bare pattern + full shape). I wrote three: `minimal.ts` (~90 LOC), `middle.ts` (~342 LOC), `canonical.ts` (~410 LOC).
7. **Commands declarative, type-inferred** — user requested plugin-declared commands with type inference, not `registerCommand(name, handler)` runtime calls. Rewrote `canonical.ts` with nested typed command maps and `defineCommands` helper.
8. **But that still drifted from era2b** — user said we deviated from a "promising design 10-30 days ago." Recall confirmed: era2b command-tree-as-references (`app.commands.task.toggle_done`) was the target, my "canonical" used flat strings.
9. **"Many designs scattered"** — user asked to consolidate. Mapped the landscape: 6 tiers of conflicting docs, from tier 1 (era2b canonical-ish, partially stale) to tier 6 (competitor research).
10. **"One canonical place, iterate, roll out later"** — created `DESIGN.md` + `HISTORY.md` + `prototypes/` in this folder as THE design home.

**The prototypes from this session** (`prototypes/minimal.ts`, `middle.ts`, `canonical.ts`) encode my session's intermediate thinking — they don't match era2b yet. They'll be rewritten as DESIGN.md decisions stabilize (particularly Q1: nested command tree).

---

## What shipped as code (the drifted reality)

Despite all the design work, the currently-running silvery uses:

- `vendor/silvery/packages/create/src/runtime/base-app.ts` — v1r apply-chain shipped. Drain loop + reentry guard + `false | Effect[]`.
- `vendor/silvery/packages/create/src/runtime/with-*-chain.ts` — focus/paste/input/terminal chains wrapping `app.apply`.
- `vendor/silvery/packages/ag-term/src/plugins/with-*` — parallel test-harness plugin family wrapping `App.press()` (duplicate of the runtime chain; not yet collapsed).
- `vendor/silvery/packages/create/src/definePlugin.ts` — declarative factory, standalone (not integrated with apply-chain).
- `apps/km-tui/src/plugins/help-overlay.v3.ts` — the only km-tui plugin migrated to v3 shape.
- `vendor/silvery/docs/design/app-composition.md` + `plugin-architecture.md` — public-facing docs; describe a simpler story than what's in code.

Beads tracking the gap: `km-silvery.era2`, `km-silvery.tea-composite-ops`, `km-silvery.tea-state-delta-convention`, `km-silvery.tea-gap-substrate-merge`, `km-silvery.authoring-elegance`, plus the 226-call-site `sel.*` migration. Most open, most P1.

---

## Key reviews and retrospectives

- `hub/0LD/silvery/2026-04-21-retrospectives/elegance-review-2026-04-21.md` — dual-LLM elegance review
- `hub/0LD/silvery/2026-04-21-retrospectives/tea-review-responses.md` — responses
- `hub/0LD/silvery/2026-04-21-retrospectives/km-tea-phase1-plan.md` — phase 1 plan
- `hub/0LD/silvery/2026-04-21-retrospectives/definePlugin-spike.md` — spike retrospective
- `hub/silvery/reference/reviews/tealess-gpt-review.md` — GPT review of "tealess" variant
- `hub/silvery/launch/deep-research-marketing-critique.md` — broader critique

---

## Summary of what we know works, what doesn't

**Works** (validated by prototypes or shipped use):
- `pipe(with*())` layering with closure-wrap is clear and composable — validated by aichat-composed (10 plugins, clean)
- Mutation-in-place plugin pattern — any spread breaks closure identity (validated negatively by `withApp()` bug)
- Pure-reducer slices are easy to test and replay — validated by headless + tea-nav spikes
- Type inference via `PayloadOf<R>` / `${name}.${opKey}` — validated by definePlugin
- Signals (alien-signals) for cross-plugin reactive state — in production km-tui code
- Providers as "external data source" abstraction — in production (term-provider, storage)

**Does not work** (validated negatively):
- Singleton stores outside the pipe — aichat v1 proved they mesh across features
- `return {...app, ...}` — breaks closure identity (`withApp()` spread bug)
- Role lanes as type tag — pipe order already expresses role, tag just reifies
- `state_delta` effect convention for undo — fighting the wrong seam; commands are the right one
- `{[]}` vs `false` return without helpers — footgun, never got fixed

**Open** (no clear answer yet):
- Command tree vs flat map (Q1)
- Effects: tuple return vs `effect:*` namespace (Q3)
- Models as separate noun vs merged into commands (Q4)
- Args schema surface (Q5)
- Keymap location (Q6)

See `DESIGN.md` for the current iteration.

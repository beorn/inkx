---
mentions:
  - km
id: "@km/silvery/architectural-plateau"
aliases:
  - km-silvery.architectural-plateau
  - km-silvery-architectural-plateau
created_by: claude:2405c72e
created_at: 2026-04-25T06:15:56Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.architectural-plateau
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T23:16:16Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] [meta-epic] Silvery architectural plateau — view-as-layout-output, TEA, signals, focus/selection unification @km/silvery #epic #P0

blocks:: [[@km/silvery]]

## What this is

Single tracking bead for the architectural endpoint silvery is converging on. Multiple existing P0 epics are independently pushing toward the same model — this bead names the destination, lists the pieces, and orders them around the TEA migration boundary.

## The destination — "correct architecture"

A deterministic, signal-driven silvery where:

1. **Components don't read layout dimensions** — they describe semantic intent via props (wrap=wrap, flex-grow=1, cursor-offset, virtualize-around=cursor); the layout engine fills in dimensions. No `useBoxRect`-stale-read class of bugs.
2. **View state is layout output, not effect output** — cursor / selection / focus computed synchronously alongside box positions; layout-signals as single source of truth.
3. **App architecture is TEA** — `(action, state) → [state, effects]` everywhere, serializable, composable, testable, replayable.
4. **Plugin API is elegant** — authoring a silvery plugin is as ergonomic as authoring a React component.
5. **Defaults are sensible** — flexShrink default flipped to 1 with Yoga-compat preset for migrators; wrap "just works"; Prose demoted from required-wrapper to optional sugar.
6. **Layout doesn't leak pixels** — incremental rendering invariant under layout churn.

## Phases (re-ordered 2026-04-25 — view-as-layout-output moved into pre-TEA)

### Pre-TEA — substrate cleanup + view-as-layout

These ship without depending on TEA. They are mechanical/additive/corrective and clean the substrate so TEA can build on a stable, deterministic base.

- ✅ **`km-silvery.layout-churn-leaks-pixels`** (closed un-repro 2026-04-25) — pipeline correctness invariant; not reproducible on current main; 5 STRICT scaffold tests landed
- ✅ **`km-silvery.lifecycle-scope`** (closed 2026-04-25) — structured-concurrency `Scope` primitive wired through `run()/createApp()`; `useScope`/`useScopeEffect`/`useAppScope` hooks shipped
- ⏳ **`km-silvery.flexshrink-default`** (Phase 1-4, 9-10 closed; Phase 6 flip + Phase 5 audit deferred) — defaults preset config landed; actual flip is a follow-up bead
- 🆕 **`km-silvery.view-as-layout-output`** (P1, MOVED from post-TEA → pre-TEA, deep scope ~1 week) — components don't read layout dimensions; cursor/selection/focus + ListView height-independence; eliminates the `useBoxRect`-stale-read bug class. Closes leaf bugs `km-silvercode.cursor-startup-position` and `km-silvercode.message-wrap-truncation`. See bead description for the 6-phase plan.

### TEA — architecture itself

Once the substrate is stable, the architectural shift. Signals + commands + scopes as the unified primitives every silvery app composes.

- **`km-silvery.tea`** (P0 epic) — `(action, state) → [state, effects]` model. Builds on the `Scope` primitive (pre-TEA), the layout-output pattern (pre-TEA), and unified signals. Lands the apply-chain substrate that downstream features compose with.

### Post-TEA — features built on TEA

These migrate stragglers onto TEA's substrate. They depend on TEA for their cleanest implementation.

- **`km-silvery.selection-focus-plateau`** (P0 epic) — selection + focus as TEA machines; uses cursor/selection/focus signals from view-as-layout-output (pre-TEA)
- **`km-silvery.focus-ink-parity`** (P0 epic) — focus model as a TEA machine, scope-aware, Ink-compatible
- **`km-silvery.authoring-elegance`** (P0) — plugin API ergonomics. Clean only once TEA primitives exist; otherwise the API leaks the intermediate complexity.

## Why view-as-layout-output goes BEFORE TEA

The original plateau ordering put view-as-layout-output AFTER TEA, on the assumption that TEA would deliver the unified primitives first and view-as-layout-output would adopt them. /big analysis 2026-04-25 surfaced that this ordering is wrong:

1. **view-as-layout-output is independent of TEA's machinery.** It uses alien-signals (already shipped) and the existing layout-signals system. No state machines, commands, or scopes required for the view-as-layout work itself.
2. **It UNBLOCKS leaf bugs that the user is hitting today.** Cursor parking in the side panel, paragraph wrap truncation — both fixed by view-as-layout-output, both currently hurting silvercode dogfood.
3. **TEA can adopt the same pattern without re-doing the work.** When TEA lands, it adopts the layout-output substrate as its source of truth for view state.
4. **Ergonomic clarity propagates upward.** With "components don't read layout" as a substrate, TEA's plugin API and selection/focus migrations become simpler.

## What this meta-epic doesn't ship

- It is a tracking surface, not a work item. Do NOT close it as the children close — close children individually, let this one accumulate "completed" sections in its description until all are green.
- It does not by itself include TEA's app-state architecture, plugin API, or the selection/focus state-machine refactor — those are the children.

## Distance to plateau

Per /big 2026-04-25: silvery is ~70% of the way. Pre-TEA progress: 3/4 done (lifecycle-scope, layout-churn, flexshrink preset) + view-as-layout-output queued. Then TEA. Then post-TEA. **Estimated 1-2 quarters of focused architectural work** total; pre-TEA closes within 2-3 weeks once view-as-layout-output starts.

## Acceptance

This bead is "complete" when:

- All 8 children above are closed
- A pattern doc lives in `vendor/silvery/docs/guide/architecture.md` explaining the unified model
- Cursor / selection / focus / app state all use the same primitives end-to-end
- silvercode + @km/tui consume the new model with zero hand-rolled flex shimming, zero `scheduler.subscribeX` band-aids, zero `useState/setNode` propagation dances, zero per-feature stores (cursor, selection, focus, etc.)
- The "correct architecture" reads as one coherent story in the silvery docs

## References

- `km-session.0424-silvercode` — /big analysis that surfaced the convergence + the deep view-as-layout-output reframe (2026-04-25)
- testfix-2 tribe message 2026-04-25 — flexshrink reframe (multi-target framework, defaults flip with Yoga preset)
- `vendor/silvery/CLAUDE.md` — current architecture
- `docs/silvery-positioning-brief.md` — positioning (silvery is multi-target, not TUI-only)
- `hub/silvery/design/lifecycle-scope.md` — canonical Scope primitive design (pre-TEA, shipped)


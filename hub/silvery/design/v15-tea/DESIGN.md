# Silvery App Architecture — Design

> **Canonical.** Iterate here. Other docs in this folder are historical reference; updated at rollout.

**Prototype**: `prototypes/minimal.ts` (~90 LOC) — bare pattern (scope + pipe + one seam). Canonical full example deferred until more Q's resolve; no value accumulating dead spikes.

**Legend**: `[x]` decided · `[~]` needs code verification · `[ ]` open. Unified number space D1-D29.

Five layers top-down by dependency: **Foundations → Write → Read → Output → Meta**. Each D states the decision in one line; rationale/tradeoffs only where non-obvious.

---

## 1. Foundations

Two programming models on the same primitives, mixable per function:

1. **TEA-as-data** — `dispatch → command → effect`, wrapped via `op()`/`fx()` (dispatchable, replayable, mockable).
2. **React-like direct** — plain calls, signals for reactive reads.
3. **Bridge** — `op`/`fx` promote; unwrapped stays direct. Same app mixes both.

Opinionated about primitives, unopinionated about lane.

- [x] **D26** — **CQRS.** Writes go through dispatch/apply; reactive reads go through signals. Commands may read state synchronously to compute next state, but never subscribe or mutate outside dispatch. Views subscribe only.
- [x] **D27** — **`op()`/`fx()` wrappers.** `op(fn)` → command (dispatchable, serializable, replayable). `fx(fn)` → effect (queued, mockable, async). Unwrapped = plain function. Opt-in per function.
- [x] **D28** — **Dual-model.** Centralized event-loop/TEA-as-data and React-like direct calls coexist on the same primitives. No mode flag; choice is per-function.
- [x] **D29** — **Maximum type inference (principle).** Authors write minimum types; TS infers the rest. No call-site annotations, no casts, no user-supplied type parameters. Governs every API decision.
- [x] **D2** — **Plugin shape.** `with*(app)` Slate-style: closure-capture prev, override, mutate in place, return `app & HasX`. Never respread.
- [x] **D3** — **Composition.** `pipe(seed, ...plugins)`. Pipe order = layer order.
- [x] **D8** — **Layer legibility.** Each plugin understandable in isolation. No role lanes, no shared-string op unions.
- [x] **D19** — **Ordering enforcement.** Pure TS intersection constraints (`<A extends HasX>`). No runtime checks, no branded types, no docs-by-convention.
- [ ] **D1** — Framework surface: `scope` + `pipe` only, or + `dispatch`? Core-primitive avoids per-plugin routing; plugin-contribution keeps core minimal.
- [ ] **D5** — Providers vs plugins: separate concept or just state-ful plugins with dispose? One primitive or two?

---

## 2. Write — Events → Commands → Effects

User action enters as event; dispatches to command; command mutates state and/or queues effects.

- [x] **D10** — **Dispatch.** Unified `dispatch(event)` with discriminated union. All inputs (key/mouse/paste/focus/resize) are events.
- [x] **D6** — **Commands are references.** `app.commands.task.toggle_done` is canonical. `op(fn)` adds as-data metadata; path ↔ reference conversion is intrinsic.
- [~] **D7** — **Nested namespaces.** `app.commands.domain.action`. Needs verification: TS type-threading for multi-plugin same-domain contributions across 10+ pipe steps.
- [x] **D13** — **Serialization registry.** In-memory nested tree for type safety; flat CommandRegistry for boundaries (CLI/MCP/config). Auto-flattened; `pathOf()`/`commandAt()` bidirectional.
- [x] **D14** — **Args schema.** Pure TS by default; optional Zod/Standard Schema attached per-command for boundary validation.
- [x] **D12** — **Cross-plugin dispatch.** Direct calls for tight coupling (type-enforced order); dispatch events for loose coupling (replayable, decoupled).
- [x] **D11** — **Effects.** `fx(fn)` opt-in wrapper. `withEffects()` plugin holds queue + executor. Unwrapped async functions stay plain.
- [ ] **D18** — Models separate from commands (`app.models.task` + `app.commands.task` wrapper) vs collapsed into one?

---

## 3. Read — Signals & State

Reactive read path. No mutations.

- [x] **D4** — **Signals.** alien-signals is the primary state layer. Reactive subscriptions only; writes never happen here.
- [ ] **D21** — Undo granularity: per-command snapshots, per-domain, or user-opt-in? Where does the undoable list live?

---

## 4. Output — Render & Keymap

State → pixels; input → commands.

- [ ] **D9** — **Rendering in scope.** `withAg`/`withTerm`/`withReact` are plugin layers here (era2a/b split dissolved).
- [ ] **D17** — Rendering explicit in pipe (`withRender({term})`) vs implied/auto-wired?
- [~] **D15** — **Keymap plugin.** `app.keymaps.{mode}.{key} = command`. Keymaps mutable/composable; commands immutable/reusable. Needs verification: mode-stacking + cross-plugin merge in TS.
- [ ] **D20** — Keymap modes (vim, modal): one-per-plugin stacked by context? Conflict resolution?

---

## 5. Meta — Test, Observe, AI, Lifecycle, Extend

Cross-cutting concerns.

- [x] **D16** — **Test harness.** Same pipe; swap providers (storage/terminal/clock) with mocks. Capture effects for assertions.
- [ ] **D22** — Observability: wrap `invokeCommand` only, or both `dispatch` + `invokeCommand`?
- [ ] **D23** — AI surface: read-only `{commands, snapshot}` vs gated `withAgent({gate, llm})`?
- [ ] **D24** — Lifecycle: async dispose, init phases (before/after mount), error boundaries.
- [ ] **D25** — Third-party plugin discovery + versioning (`silvery-plugin-*` convention?).

---

## Rollout (when all [x])

1. Propagate into `v15-tea/` siblings as chapters.
2. Update `vendor/silvery/docs/` (public).
3. Implement in `vendor/silvery/packages/create/`.
4. Archive drifted code (`runtime/base-app.ts`, `runtime/with-*-chain.ts`, `definePlugin.ts`, `ag-term/plugins/with-*`, `0LD/plugin-system-*`).
5. Migrate km-tui plugins.

## Status

- **Decided**: 16 — D2, D3, D4, D6, D8, D10, D11, D12, D13, D14, D16, D19, D26, D27, D28, D29
- **Needs verification**: 2 — D7, D15
- **Open**: 11 — D1, D5, D9, D17, D18, D20, D21, D22, D23, D24, D25
- **Total**: 29

## Changelog

- **2026-04-22** — Deleted 10 redundant prototype spikes (middle, canonical, q1-q15). Kept only `minimal.ts`. Rationale: decisions live in DESIGN.md; spikes were scratch that served their purpose. Git has history.
- **2026-04-22** — Flattened to 5 layers, no subsections. Tightened all D's to 1-2 sentences. Trimmed verbose changelog.
- **2026-04-22** — Marked D15 [~] (needs verification). Resolved D19 (pure TS intersection). Added D29 (max type inference). 16 locked.
- **2026-04-22** — Added D28 (dual-model) and D27 (`op`/`fx` wrappers). Rewrote Foundations intro.
- **2026-04-22** — Added D26 (CQRS backbone). Corrected: commands can read state to compute next state.
- **2026-04-22** — Restructured by architectural dependency. Merged open questions into topic sections.
- **2026-04-22** — Resolved D10-D16 in sequence (dispatch, commands, effects, cross-plugin, serialization, schema, keymap, test harness).
- **2026-04-22** — Draft 0: consolidated from scattered designs.

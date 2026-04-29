---
id: "@km/all/tea-machines"
aliases:
  - km-all.tea-machines
  - km-all-tea-machines
created_by: claude:e7c823b8
created_at: 2026-02-27T14:13:23Z
closed_at: 2026-04-11T19:18:16Z
---

# [x] TEA state machines: unify all interactive subsystems as pure (action, state) → [state, effects] @km/all #feature #P0 @Bjørn Stabell

TEA state machines: unify all interactive subsystems' INNER reducers as pure (state, op) → [state, effects].

Every inner domain machine (PlainText, Tree, Board, Dialog, Search, …) is a noun-singleton with .apply(state, op) → [state, effects]. Machines compose via effects. Operations and effects are serializable data.

## Scope clarification (added 2026-04-21)

This bead defines the signature for the **inner layer** — pure domain reducers called from within a plugin. It is **NOT** the signature of the silvery outer plugin bus / apply chain, which uses `apply(op) → false | Effect[]` (a middleware / chain-of-responsibility contract where plugins own slice state privately and return effect descriptors).

Both layers are canonical, at different levels:

- **Inner (this bead)**: `(state, op) → [state, effects]` — classic TEA, used inside plugins to compute next slice state. Example: `applyNavigation(state, op)` in `board-reducer.ts`, `PlainText.apply`, `Tree.apply`, `Board.apply`.
- **Outer (@km/all/tea-discuss §3)**: `apply(op) → false | Effect[]` — shipped plugin contract in `@silvery/create/runtime/`, wraps inner reducers via closure over zustand slice state; `false` means "not mine, delegate to `prev(op)`".

Earlier sessions (and the dual-pro review of 2026-04-21) flagged these as contradictory. They are not — the earlier "universal signature — no exceptions" phrasing over-reached by describing the outer bus with an inner-layer signature. See `km-all.tea-discuss` §3 and "Reconciliation notes (2026-04-21)" for full treatment.

Design doc: docs/design/tea.md (inner reducer shape, phase roadmap)
Outer plugin bus reference: @km/all/tea-discuss
createSlice (L3): vendor/silvery/packages/create/src/core/slice.ts (shipped)
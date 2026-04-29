---
id: "@km/_orphan/5kh9r"
aliases:
  - km-5kh9r
created_by: claude:e4e70c9a
created_at: 2026-03-10T22:12:26Z
closed_at: 2026-03-11T07:38:11Z
close_reason: Design doc finalized at
  vendor/silvery-internal/design/state-api-redesign.md. All 10 open questions
  resolved with decisions. Strategic positioning validated by O3 deep research.
  Implementation tracked in km-silvery.api-impl.
---

# [x] Redesign silvery state management API surface @km/_orphan #feature #P2 @claude:e4e70c9a

The current API surface (createApp, createSlice, createEffects, createStore, run) is confusing:

1. **createApp vs createSlice overlap**: createApp bundles runtime + store + events. createSlice defines state + handlers. But they're presented as progressive 'levels' when they're actually different layers. Most apps have one slice that IS the entire state, so 'slice' is misleading.

2. **Inconsistent shape**: createApp takes a Zustand StateCreator (set/get), createSlice takes (init, handlers) with signals. The jump between them requires learning three things at once (signals, ops-as-data, dispatch).

3. **Naming confusion**: 'slice' implies 'piece of a whole' (Zustand/Redux meaning) but is usually the whole thing. 'app' bundles too many concerns. The terminology doesn't tell you what layer you're at.

4. **Inconsistent bundling**: createApp has a `key` handler for input, but state and actions are separate (via createSlice). Why not bundle effects too? The grouping feels arbitrary — state+actions in one place, effects defined separately, events in yet another place.

5. **Missing unified API**: Could createApp just accept what createSlice accepts directly? state + actions + effects + events in one definition, with slices only appearing when you need composition (multiple independent state machines).

Desired outcome: A coherent API where the names match the concepts, the progression is smooth (useState → one unified API → composition), and the docs don't need to teach Zustand internals as an intermediate step.
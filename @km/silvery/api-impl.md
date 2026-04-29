---
id: "@km/silvery/api-impl"
aliases:
  - km-silvery.api-impl
  - km-silvery-api-impl
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:38Z
closed_at: 2026-03-27T19:02:14Z
close_reason: "Grooming: superseded by era2 phase beads (km-silvery.era2b-0-tea
  through era2b-app)"
owner: bjorn@stabell.org
---

# [x] Implement silvery API redesign (state-api-redesign.md) @km/silvery #task #P2

Implement the API redesign specified in `silvery-internal/design/state-api-redesign.md`:

Phase 1 — Core:
- createModel({ state, updates, effects? }) replacing createSlice + createEffects
- createRuntime({ term, fs }) with sync inner loop
- Plugin composition: pipe() with (app) => app & NewStuff pattern
- run(el, config?) convenience wrapper
- render(el, config?) unified render function

Phase 2 — Views:
- createReactView(<App/>, term) — self-contained view bundling
- View decoupled from runtime (runtime is framework-agnostic)

Phase 3 — Ecosystem:
- @silvery/tea/react, @silvery/tea/svelte, @silvery/tea/vue bindings
- Framework-agnostic useModel() pattern
- Cross-model dispatch via typed op builders

Phase 4 — Migration:
- Deprecated wrappers for createSlice, createApp, useApp
- Migration codemod or guide

Depends on design doc being finalized (@km/_orphan/5kh9r).
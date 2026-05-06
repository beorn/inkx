---
mentions:
  - km
  - Bjørn
id: "@km/silvery/plugin-system-stores"
aliases:
  - km-silvery.plugin-system-stores
  - km-silvery-plugin-system-stores
created_by: Bjørn Stabell
created_at: 2026-04-10T23:54:08Z
closed_at: 2026-04-11T15:18:08Z
close_reason: "Phase 1 complete: architecture agreed. Consumer API stable (run,
  createApp, useInput). TEA internals are black box behind createApp. Design
  specs committed. Spawned phase 2 (km-silvery.tea-useinput) and phase 3
  (km-silvery.tea-aichat)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Plugin system: V1 refinement — handled return, effects as data, observer lane @km/silvery #task #P1 @Bjørn Stabell

V1 refined plugin architecture — 3 phases.

Consumer API boundary (stable):
  Tier 1: run(<App />) — everything bundled
  Tier 2: createApp(storeFactory, handlers).run(element, opts) — TEA store, still bundled
  Internal: pipe() + with*() — used by createApp under the hood and test drivers

Phase 1: Agree on package boundaries + stable consumer API (DONE)
Phase 2: Fix useInput precedence bugs with tentative TEA inside createApp
Phase 3: Finalize TEA via aichat-v2 prototype, then roll out

TEA internals (apply chain, effects, plugin composition) are a black box behind createApp.
Experimenting with TEA doesn't change consumer imports.

Design specs:
  plugin-system-v1r.ts — V1 refined (apply returns false | Effect[])
  plugin-system-v2.ts — V2 exploration (kept as reference)
  prototype/aichat-v2/ — signals/models/commands validation


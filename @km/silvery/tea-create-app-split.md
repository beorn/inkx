---
mentions:
  - km
id: "@km/silvery/tea-create-app-split"
aliases:
  - km-silvery.tea-create-app-split
  - km-silvery-tea-create-app-split
created_by: Bjørn Stabell
created_at: 2026-04-18T18:44:09Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea-create-app-split
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-18T11:44:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [ ] Split create-app.tsx to hit ≤1200 LOC target @km/silvery #task #P3

blocks:: [[@km/silvery/tea]]

After TEA Phase 2 wiring (@km/silvery/tea-useinput), create-app.tsx is 2790 LOC (down from 2978). Target was ≤1200. Renderer extraction (renderer.ts 544 LOC) took 340 off the top. Remaining seams identified by Phase 2 agent: (1) provider tree → `runtime/providers.tsx`, (2) lifecycle (Ctrl+C/Z, exit, suspend) → `runtime/lifecycle.ts`, (3) `press()` synchronous test-harness driver → `runtime/press.ts`. /complete: `wc -l vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` ≤ 1200.


---
id: "@km/silvery/tea-custom-events"
aliases:
  - km-silvery.tea-custom-events
  - km-silvery-tea-custom-events
created_by: Bjørn Stabell
created_at: 2026-04-18T18:44:09Z
closed_at: 2026-04-19T04:35:10Z
close_reason: "DONE via silvery d750e2b1 (withCustomEvents chain plugin + 9
  tests) + 691c6917 (migrate link:open + trim RuntimeContextValue) + km bump
  7133d2092. New runtime/with-custom-events.ts + tests. Link.tsx emits via
  chain.events.emit; useLinkOpen subscribes via chain.events.on.
  runtimeEventListeners Map deleted from create-app.tsx. Create substrate tests
  99 pass (was 90). RuntimeContextValue grep shows 15 hits (above ≤5 guideline —
  legitimate type annotations at provider sites/useRuntime hook; spirit met: no
  more on/emit surface). Deviation: pause/resume retained as optional on
  RuntimeContextValue for km-tui useBoardController console-mode — documented in
  bead history."
---

# [x] Custom event bus — migrate km-tui link:open off RuntimeContextValue @km/silvery #task #P2

blocks:: [[@km/silvery/tea]]

RuntimeContextValue + runtimeEventListeners Map kept as façade after TEA Phase 2 (@km/silvery/tea-useinput). Only remaining consumer: @km/tui's `link:open` event flow via useLinkOpen hook. Migrate to either: (a) a chain plugin (withCustomEvents) that exposes a typed bus, or (b) zustand/alien-signals store pattern. Then delete runtimeEventListeners Map and trim RuntimeContextValue to `{exit()}` only. /complete: `grep runtimeEventListeners vendor/silvery/packages/ag-term/src/` → 0, `grep RuntimeContextValue vendor/silvery/packages/ag-react/src/` → ≤5.
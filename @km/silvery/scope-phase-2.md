---
id: "@km/silvery/scope-phase-2"
aliases:
  - km-silvery.scope-phase-2
  - km-silvery-scope-phase-2
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:19Z
closed_at: 2026-04-24T22:09:27Z
close_reason: Closed
started_at: 2026-04-24T21:54:27Z
owner: bjorn@stabell.org
assignee: claude:2aefb4b6
dependencies:
  - issue_id: km-silvery.scope-phase-2
    depends_on_id: km-silvery.lifecycle-scope
    type: parent-child
    created_at: 2026-04-24T13:39:19Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-2
    depends_on_id: km-silvery.scope-phase-1
    type: blocks
    created_at: 2026-04-24T13:39:19Z
    created_by: claude:2aefb4b6
    metadata: "{}"
---

# [x] Phase 2: Silvery-owned APIs return Disposable (1 day) @km/silvery #task #P1 @claude:2aefb4b6

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-1]]

Silvery has APIs where users can't reach the underlying resource to wrap with disposable(). Make those return Disposable directly: term.signals.on(signal, fn, opts) → Disposable (currently returns unregister fn); term.modes.enable(mode) / rawMode / altScreen / mouseTracking → Disposable; mountSubroot(element) → { unmount(): void } & Disposable (if not already). NO @silvery/node / @silvery/web / @silvery/core wrapper packages. Users call native APIs (child_process.spawn, fs.watch, new WebSocket, setTimeout, emitter.on) directly and use disposable(value, cleanup) or scope.defer(cleanup). The disposable() helper already lives in @silvery/scope from Phase 0. Exit: silvery-owned subscription/mode/root APIs return Disposable. No new packages shipped.
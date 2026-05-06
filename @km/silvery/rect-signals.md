---
mentions:
  - km
id: "@km/silvery/rect-signals"
aliases:
  - km-silvery.rect-signals
  - km-silvery-rect-signals
created_by: Bjørn Stabell
created_at: 2026-04-12T07:52:44Z
closed_at: 2026-04-12T08:35:53Z
close_reason: boxRect/scrollRect/screenRect as alien-signals.
  useReactiveRect/useCallbackRect now use effect() from @silvery/signals.
  WeakMap-backed, lazy allocation, backward-compatible (layoutSubscribers still
  works). Commit 1790d25a.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.rect-signals
    depends_on_id: km-silvery.reactive-pipeline
    type: parent-child
    created_at: 2026-04-12T00:52:44Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-silvery.rect-signals
    depends_on_id: km-silvery.test-runtime-parity
    type: blocks
    created_at: 2026-04-12T00:52:45Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.reactive-pipeline
      - type: link
        target: km-silvery.test-runtime-parity
---

# [x] boxRect/screenRect as signal sources for useBoxRect/useScrollRect hooks @km/silvery #feature #P2

blocks:: [[@km/silvery/reactive-pipeline]], [[@km/silvery/test-runtime-parity]]

Make boxRect and screenRect signal sources (alien-signals) so useBoxRect() and useScrollRect() hooks are reactive reads instead of layout-subscriber callbacks.

Currently: layoutPhase computes rects → fires layoutSubscribers callbacks → hooks re-render via setState. This is push-based with manual subscription management.

After: layoutPhase writes to rect signals → hooks read signals → React re-renders only when the signal value changes. Pull-based, automatic dependency tracking, no manual subscribe/unsubscribe.

This completes the reactive pipeline for layout OUTPUT:

- Layout gate: Flexily isDirty() (plain boolean, engine-internal)
- Layout output: boxRect/screenRect (alien-signals) ← THIS BEAD
- Render cascade: dirty flags → skip decisions (already signals in reactive-node.ts)

Architecture boundary: signals are for silvery-side state (rects, dirty flags, render decisions). Flexily owns its own internal state — no signals inside Flexily.

Files:

- vendor/silvery/packages/ag-term/src/pipeline/layout-phase.ts (write to signals after propagateLayout)
- vendor/silvery/packages/ag-react/src/hooks/useLayout.ts (read from signals instead of subscribers)
- vendor/silvery/packages/ag/src/types.ts (add signal fields to AgNode)

Depends on: @km/silvery/test-runtime-parity (clean layout gate first)


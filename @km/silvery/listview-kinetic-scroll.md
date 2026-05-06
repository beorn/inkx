---
mentions:
  - km
  - claude
id: "@km/silvery/listview-kinetic-scroll"
aliases:
  - km-silvery.listview-kinetic-scroll
  - km-silvery-listview-kinetic-scroll
created_by: claude:c56dc5d6
created_at: 2026-04-23T16:52:44Z
owner: bjorn@stabell.org
assignee: claude:c56dc5d6
dependencies:
  - issue_id: km-silvery.listview-kinetic-scroll
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T09:52:47Z
    created_by: claude:c56dc5d6
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [/] ListView: default kinetic viewport scroll (iOS-style) @km/silvery #feature #P2 @claude:c56dc5d6

blocks:: [[@km/silvery]]

Replace nav-mode wheel-moves-cursor with default viewport scroll + iOS-style kinetic physics. Wheel over the ListView scrolls its viewport without moving the cursor. Keyboard cursor moves snap viewport back. No backcompat — remove the onWheel consumer-override hack from the prior incremental change.

Physics: exponential velocity decay (~0.95/frame), sub-item float accumulator for smooth feel, integer scrollTo binding. Capped velocity. 60Hz animation loop while velocity > threshold.

Acceptance:
  rg 'if \(onWheelProp\) return onWheelProp' vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx → 0 hits
  rg 'wheelMode|onWheel\?' vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx → 0 hits (onWheel prop removed)
  apps/@km/logview/src/App.tsx has no scrollAnchor state
  tests/wheel-scrolls-viewport passes (cursor unmoved, viewport scrolled)
  tests/wheel-kinetic-continues passes (timer advance after last wheel event continues scrolling)
  bun run typecheck exit 0
  bun vitest run --project vendor vendor/silvery/tests/ui/list-view.test.tsx vendor/silvery/tests/features/listview-*.test.tsx all pass


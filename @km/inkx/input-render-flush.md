---
id: "@km/inkx/input-render-flush"
aliases:
  - km-inkx.input-render-flush
  - km-inkx-input-render-flush
created_by: claude:2f3fc9d8
created_at: 2026-02-11T19:02:05Z
closed_at: 2026-02-11T19:19:34Z
---

# [x] useInput state updates from child components don't trigger render flush @km/inkx #bug #P2 @claude:2f3fc9d8

When a child component (e.g. TextArea) receives input via useInput and updates parent state via onChange callback, React's concurrent scheduler defers the commit. inkx's onCommit → scheduleRender never fires, so the frame isn't rendered. Workaround: parent must also update state in its own useInput handler. Fix: force React to flush pending work after emitting input events (flushSync or reconciler.flushSyncWork after eventEmitter.emit).
---
id: "@km/tui/view-coalescing"
aliases:
  - km-tui.view-coalescing
  - km-tui-view-coalescing
created_by: Bjørn Stabell
created_at: 2026-04-06T00:49:34Z
closed_at: 2026-04-07T06:00:23Z
close_reason: "Fixed via km 1fed20fad (silvery f8cc395). Drain-then-render:
  replaces single microtask yield with bounded drain loop using setImmediate,
  looping until eventQueue stabilizes (cap maxDrainSpins=32). 10 rapid keys → 1
  processEventBatch → 1 doRender. event-coalescing.test.tsx covers 10/5+5/25 key
  bursts, all ≤2 batches."
---

# [x] Coalesce rapid view updates — debounce re-render for batched keypresses @km/tui #feature #P0 @Bjørn Stabell

Coalesce rapid view updates — process entire input queue before rendering.

NOT time-based debouncing. Instead: drain the full input queue (all pending keypresses), process each command, THEN render once. This means if 5 keys arrive between frames, all 5 execute but only the final state is painted.

Two levels:
1. Input queue drain: process all buffered stdin bytes before yielding to render
2. React batch: ensure all store mutations from the queue batch into one React render

User feedback: 'it batches up the keys and still tries to execute each in sequence — I'd like coalescing so I can quickly jump from fold level 1 to 10 without redrawing every level in between'

Key insight: this is about processing the ENTIRE input queue before rendering, not about delaying/debouncing individual keys.
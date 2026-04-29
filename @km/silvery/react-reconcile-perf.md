---
id: "@km/silvery/react-reconcile-perf"
aliases:
  - km-silvery.react-reconcile-perf
  - km-silvery-react-reconcile-perf
created_by: Bjørn Stabell
created_at: 2026-04-10T21:03:06Z
closed_at: 2026-04-10T21:14:31Z
close_reason: "Fixed: lazy TextFrame. Was 87% of frame time — 80K Cell objects
  created eagerly every frame. Now lazy. 100 items: 0.15ms (15.7x vs Ink). 1000
  items: 1.5ms (16.0x vs Ink). 400x200: 14.8ms→2.0ms."
owner: bjorn@stabell.org
---

# [x] Per-frame buffer scaling at 400x200 — lazy TextFrame + skip createTextFrame @km/silvery #task #P2

NOT React reconciliation — buffer operations scale with terminal area (80K cells at 400x200).

Key finding: no-change rerender costs same as cursor move (3.3ms vs 3.5ms at 80x24, 13.3ms vs 13.0ms at 400x200). React is not the bottleneck.

Bottlenecks:
1. createTextFrame: clones buffer + creates 80K Cell objects every frame (biggest cost)
2. prevBuffer.clone: 320KB typed array copy
3. syncPrevLayout: O(N) tree walk

Fix: lazy TextFrame — defer Cell object creation to on-demand cell() access. Skip createTextFrame entirely when frame isnt consumed. Could drop 400x200 from 13ms to 3-4ms.
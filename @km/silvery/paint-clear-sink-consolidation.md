---
id: "@km/silvery/paint-clear-sink-consolidation"
aliases:
  - km-silvery.paint-clear-sink-consolidation
  - km-silvery-paint-clear-sink-consolidation
created_by: claude:cc081a9a
created_at: 2026-04-27T20:22:42Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.paint-clear-sink-consolidation
    depends_on_id: km-silvery.paint-clear-l5-final
    type: parent-child
    created_at: 2026-04-27T13:26:26Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] Paint-clear Step 2 — consolidate sink sprawl to one threaded sink @km/silvery #task #P2

blocks:: [[@km/silvery/paint-clear-l5-final]]

From dual-pro review (Kimi K2.6 winner, 2026-04-27): Smell #2 — multiple sink instances will turn Step 2 (PlanSink authoritative) from a signature change into a multi-file mechanical slog. Action: collapse to a single sink threaded through render-phase recursion (nodeSink, paintSink, etc.). Gating: STRICT-mode test at 50+ nodes proving sink-count-1 invariant. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 202-210.
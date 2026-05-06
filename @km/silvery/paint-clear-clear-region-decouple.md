---
mentions:
  - km
id: "@km/silvery/paint-clear-clear-region-decouple"
aliases:
  - km-silvery.paint-clear-clear-region-decouple
  - km-silvery-paint-clear-clear-region-decouple
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:06Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.paint-clear-clear-region-decouple
    depends_on_id: km-silvery.paint-clear-l5-final
    type: parent-child
    created_at: 2026-04-27T13:23:05Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.paint-clear-l5-final
---

# [ ] Paint-clear Step 2 — decouple clearNodeRegion from clearExcessArea @km/silvery #task #P2

blocks:: [[@km/silvery/paint-clear-l5-final]]

From dual-pro review (Kimi K2.6 winner, 2026-04-27): Smell #3 — clearNodeRegion delegates to clearExcessArea, mixing two responsibilities (region clearing vs shrink-bounds clearing). Action: split the paths so clearNodeRegion has its own implementation, freeing clearExcessArea for eventual deletion in Step 6. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 211-235.


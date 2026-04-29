---
id: "@km/silvery/measure-clears-dirty"
aliases:
  - km-silvery.measure-clears-dirty
  - km-silvery-measure-clears-dirty
created_by: claude:c9beade3
created_at: 2026-03-13T04:36:20Z
closed_at: 2026-03-13T04:49:23Z
close_reason: "By design: measure phase clears contentDirty for text nodes
  (nodes.ts:106) to avoid redundant text collection in same layout pass. The
  content phase compensates via textPaintDirty (paintDirty survives as witness).
  Comment at line 101-105 documents this explicitly. Updated CLAUDE.md formulas
  already include textPaintDirty."
owner: bjorn@stabell.org
---

# [x] Measure phase clears contentDirty — biggest boundary violation @km/silvery #bug #P2

In reconciler/nodes.ts, the text measure function sets node.contentDirty = false. This is the biggest phase boundary violation in the system. Measurement should not mutate render dirtiness. Forces content phase to carry compensating logic (paintDirty, textPaintDirty). GPT 5.4 pro calls this 'the sort of coupling that creates bugs forever.' Fix: use textContentVersion/measureVersion, leave render dirty semantics alone.
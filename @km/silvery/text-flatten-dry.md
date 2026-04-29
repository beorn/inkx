---
id: "@km/silvery/text-flatten-dry"
aliases:
  - km-silvery.text-flatten-dry
  - km-silvery-text-flatten-dry
created_by: claude:c9beade3
created_at: 2026-03-13T05:01:19Z
closed_at: 2026-03-13T05:21:47Z
close_reason: "Deferred: 4 simple collectTextContent variants + 1 complex
  collectTextWithBg. Key drift: measure-phase.ts missing internal_transform
  (partial fix in measure-fit-gaps). Full consolidation needs a shared
  collectTextContent with transform support exported from a utils module.
  Mechanical but touches measure/render/adapter."
---

# [x] DRY: Text flattening logic duplicated 5x and drifting @km/silvery #task #P2

collectTextContent/collectNodeTextContent duplicated in reconciler/nodes.ts, measure-phase.ts, render-text.ts (2x), content-phase-adapter.ts. Already drifting: reconciler handles internal_transform, measure doesn't. Need one shared module with modes.
---
id: "@km/flexily/unused-flexdirection-param"
aliases:
  - km-flexily.unused-flexdirection-param
  - km-flexily-unused-flexdirection-param
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:39Z
closed_at: 2026-03-13T05:39:17Z
close_reason: P4 — unused parameter, kept for API compatibility
---

# [x] Unused _flexDirection parameter in layout-helpers.ts and classic/layout.ts @km/flexily #task #P4

getLogicalEdgeValue() in layout-helpers.ts takes a _flexDirection parameter (line 45) that is never used -- the function only checks the direction (LTR/RTL) parameter to map START/END to left/right. The parameter name has an underscore prefix indicating awareness it's unused, but it adds confusion to the API. Same issue in classic/layout.ts line 45. The parameter is also passed through resolveEdgeValue(), isEdgeAuto(), and resolveEdgeBorderValue(), adding unnecessary arguments to every call site. Consider removing if CSS spec doesn't require flexDirection for START/END resolution (it doesn't -- START/END are inline-direction concepts, not flex-direction concepts). [pro]
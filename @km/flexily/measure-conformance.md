---
id: "@km/flexily/measure-conformance"
aliases:
  - km-flexily.measure-conformance
  - km-flexily-measure-conformance
created_by: claude:fed8de9e
created_at: 2026-03-30T23:49:01Z
owner: bjorn@stabell.org
---

# [ ] Yoga conformance: MeasureFunc + text height comparison tests @km/flexily #task #P2

Add MeasureFunc-based layout tests to yoga-comparison.test.ts. The chat bubble layout (column of groups, each with a shrinkwrap bubble + meta text, using MeasureFunc for text sizing) shows accumulated height drift between flexily and Yoga. Test: same tree with same MeasureFunc, compare per-node heights. Any difference is a flexily bug.

Also: add DOM conformance test (Playwright) that builds equivalent CSS flexbox, compares layout rects. This validates the full stack (flexily + text measurement) against browser truth.

Context: discovered during ag-canvas proportional text work — canvas text positioning drifts ~10px over 7 messages vs DOM. Text baseline drawing is now correct (alphabetic + fontBoundingBox). Remaining drift is layout-level.
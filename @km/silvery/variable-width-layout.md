---
id: "@km/silvery/variable-width-layout"
aliases:
  - km-silvery.variable-width-layout
  - km-silvery-variable-width-layout
created_by: Bjørn Stabell
created_at: 2026-04-14T20:01:18Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.variable-width-layout
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-14T13:01:18Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Pretext variable-width layout (layoutNextLineRange) @km/silvery #feature #P3

blocks:: [[@km/silvery]]

Implement Pretext's variable-width text layout so a text run can have different line widths for different line ranges. Currently silvery has the analysis primitives (buildTextAnalysis, countLinesAtWidth, shrinkwrapWidth, wrap='even') but no line-by-line width override. Pretext's layoutNextLineRange() is marked 'planned' in docs/guide/layouts.md.

Primary consumer: @km/tui/badge-float-layout — needs line 1 narrow (reserve badge space on right), lines 2+ wide (no badge). With variable-width, this becomes trivially expressible as float='right' on Box.

Deliverable: new silvery prop/API that lets a Text parent declare per-line-range widths OR an excluded region (rect relative to the text's content box). Text wrapping honors the per-line widths during layout.

References:
- vendor/silvery/packages/ag-term/src/pipeline/pretext.ts (current primitives)
- https://chenglou.me/pretext/ (original algorithm)
- docs/guide/layouts.md lines 450-458 (planned marker)
---
id: "@km/silvery/comp-gauge"
aliases:
  - km-silvery.comp-gauge
  - km-silvery-comp-gauge
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:43Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.comp-gauge
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:42Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Component: Gauge / meter (horizontal + radial) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Canonical Gauge for dashboards. Horizontal bar variant + radial arc/donut variant (using box-drawing or Kitty image). Complements ProgressBar for non-progress metrics.
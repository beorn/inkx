---
mentions:
  - km
id: "@km/silvery/comp-slider"
aliases:
  - km-silvery.comp-slider
  - km-silvery-comp-slider
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:41Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.comp-slider
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:41Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Component: Slider (horizontal/vertical, keyboard + mouse drag) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Canonical Slider with arrow-key nav, mouse drag, labels, tick marks, range variant. OpenTUI ships Slider; Ink does not.


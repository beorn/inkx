---
mentions:
  - km
id: "@km/silvery/a11y-high-contrast"
aliases:
  - km-silvery.a11y-high-contrast
  - km-silvery-a11y-high-contrast
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:36Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.a11y-high-contrast
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:36Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] A11y: high-contrast mode detection + useHighContrast() @km/silvery #feature #P4

blocks:: [[@km/silvery/opentui-parity]]

Detect high-contrast environment and expose useHighContrast() hook. Complements existing useIsScreenReaderEnabled.


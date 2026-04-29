---
id: "@km/silvery/a11y-reduced-motion"
aliases:
  - km-silvery.a11y-reduced-motion
  - km-silvery-a11y-reduced-motion
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:35Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.a11y-reduced-motion
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:35Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] A11y: reduced-motion detection + useReducedMotion() hook @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Detect reduced-motion preference (env var, OS setting via ANSI query) and expose useReducedMotion() for components to disable/simplify animations.
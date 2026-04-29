---
id: "@km/silvery/flexshrink-audit-silvery"
aliases:
  - km-silvery.flexshrink-audit-silvery
  - km-silvery-flexshrink-audit-silvery
created_by: claude:53042a7f
created_at: 2026-04-25T06:52:56Z
closed_at: 2026-04-25T07:28:06Z
close_reason: "Superseded by empirical flip experiment in
  km-silvery.flexshrink-flip-silvery-only. The audit revealed the fundamental
  issue is scroll-container semantics, not 'add flexShrink={0} to component X'.
  New blocker: km-silvery.scroll-container-rigid-children. ListView/VirtualList
  already have explicit flexShrink={0} on rigid rows; the regression isn't from
  missing component-level annotations but from silvery's scroll model assuming
  Yoga defaults."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.flexshrink-audit-silvery
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T23:52:56Z
    created_by: claude:53042a7f
    metadata: "{}"
---

# [x] Audit silvery components for explicit flexShrink={0} on rigid widgets @km/silvery #task #P3

blocks:: [[@km/silvery]]

Pre-flip audit: every silvery component with rigid intent (fixed dimensions, frame chrome, scroll indicators, ListView/VirtualList rows) must explicitly set flexShrink={0} so it survives the CSS preset flip (@km/silvery/flexshrink-flip-silvery-only) where flexShrink:1 is the default.

## Inventory (from @km/silvery/flexshrink-default empirical analysis)

- 104 explicit flexShrink={0} sites already in silvery (load-bearing today AND after flip — keep)
- 46 explicit flexShrink={1} sites (redundant after flip — cleanup pass)
- ~30-50 net new sites need explicit flexShrink={0} for: ListView/VirtualList rows, scroll indicators, frame chrome (borders), dialog backdrops, status bars, fixed-height/width components without flexShrink

## Approach

Run silvery tests with createFlexilyZeroEngine({defaults:'css'}) and identify regressions. For each, patch the corresponding component to set explicit flexShrink={0}.

## Blocks

- @km/silvery/flexshrink-flip-silvery-only
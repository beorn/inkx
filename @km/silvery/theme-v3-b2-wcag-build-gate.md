---
mentions:
  - km
id: "@km/silvery/theme-v3-b2-wcag-build-gate"
aliases:
  - km-silvery.theme-v3-b2-wcag-build-gate
  - km-silvery-theme-v3-b2-wcag-build-gate
created_by: Bjørn Stabell
created_at: 2026-04-19T04:09:20Z
closed_at: 2026-04-19T04:26:39Z
close_reason: Shipped at silvery 47718e69 (initial) + 4bdefe44 (simplification)
  + km bump 238bdac1e. 84 catalog-invariants tests (one per scheme), WCAG AA
  gate at build time. All 84 bundled schemes pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v3-b2-wcag-build-gate
    depends_on_id: km-silvery.theme-v3-plumbing
    type: parent-child
    created_at: 2026-04-18T21:09:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-v3-plumbing
---

# [x] B2: WCAG contrast invariants fail at build time, not runtime @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v3-plumbing]]

Catalog test validates every scheme in schemes/*.ts passes WCAG AA contrast invariants. CI gate. Complements runtime validateThemeInvariants.


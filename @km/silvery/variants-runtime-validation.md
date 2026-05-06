---
mentions:
  - km
id: "@km/silvery/variants-runtime-validation"
aliases:
  - km-silvery.variants-runtime-validation
  - km-silvery-variants-runtime-validation
created_by: Bjørn Stabell
created_at: 2026-04-19T05:56:57Z
closed_at: 2026-04-19T06:04:47Z
close_reason: Shipped at silvery a92b57f2 + km 43a799918.
  WeakMap<Theme,Set<string>> dedup (per-theme, not session-global),
  NODE_ENV=production guard, spec-format warning message. 4 new tests pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.variants-runtime-validation
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-18T22:56:57Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Runtime KnownVariant validation — dev warning on unknown variant names @km/silvery #task #P3

blocks:: [[@km/silvery]]

Text.tsx accepts variant prop typed as KnownVariant with (string & {}) escape hatch. Typos (e.g. variant="h11") render silently wrong. Add runtime: when variant is passed but not in theme.variants, emit once-per-(theme,variant) console.warn listing known variants. No throw (don't break app). Export KNOWN_VARIANTS constant from @silvery/ansi/theme/tokens. Acceptance: rg KNOWN_VARIANTS packages/ansi/src → 2+ hits; add test asserting warn fires once for unknown variant; variants.test.tsx still 18/18.


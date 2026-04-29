---
id: "@km/silvery/unify-theme-boot-helpers"
aliases:
  - km-silvery.unify-theme-boot-helpers
  - km-silvery-unify-theme-boot-helpers
created_by: Bjørn Stabell
created_at: 2026-04-19T05:56:58Z
closed_at: 2026-04-19T06:10:17Z
close_reason: "Shipped at silvery 6d73d0ef (via
  km-silvery.use-active-scheme-hook agent's bonus extraction) → d554e95c
  typecheck fix. wrapWithThemedProvider extracted; runThemed delegates in 2
  lines. 8 new tests pass. Finding: createThemedApp never existed — the bead
  presumed a pipe-chain form that was never built. Helper is available for any
  future composable boot form."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.unify-theme-boot-helpers
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-18T22:56:58Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Unify createThemedApp + runThemed into single theme boot path @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery]]

Two boot helpers exist: createThemedApp (pipe-chain form, composes with @silvery/create) and runThemed (simple run() form). Both wrap element in ThemeProvider + detectTheme. Internal duplication. Extract shared wrapWithThemedProvider(element, opts) — both helpers use it. Keep both public APIs (different call shapes) but dedupe internals. Acceptance: one internal helper; both public APIs delegate to it; existing tests pass.
---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-consumer-migration"
aliases:
  - km-silvery.sterling-consumer-migration
  - km-silvery-sterling-consumer-migration
created_by: claude:4274df30
created_at: 2026-04-20T20:39:45Z
closed_at: 2026-04-20T21:46:21Z
close_reason: "DONE: 1486→70 hits in apps/km-tui/src +
  vendor/silvery/packages/ag-react/src. Remaining 70 are documented
  Sterling-has-no-equivalent (selection 49, link 17, inverse 4). 4 commits, 112
  files. Follow-up: km-silvery.sterling-tests-legacy-sweep for
  vendor/silvery/tests/ (gated on 0.20.0)."
owner: bjorn@stabell.org
assignee: claude:a1a0e667
dependencies:
  - issue_id: km-silvery.sterling-consumer-migration
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-20T13:40:00Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-v4
---

# [x] Sterling consumer migration: rename $primary/$muted/etc. to Sterling flat tokens across km-tui + ag-react @km/silvery #task #P0 @claude:a1a0e667

blocks:: [[@km/silvery/theme-v4]]

Follow-up to Path B (Sterling 2e-F type-only break). Sterling 0.19.0 keeps inlineSterlingTokens runtime double-population so legacy flat-token resolves still work — but the Theme type no longer advertises them. This bead does the actual consumer rename so a future release can drop inlineSterlingTokens entirely.

Scope: ~100+ $primary / $muted / $accent / $link / $error / $brand / $secondary / $inverse / $surface / $popover / $selection / $focusborder / $cursor / $border consumer sites in apps/@km/tui/src + vendor/silvery/packages/ag-react/src + examples.

Approach: bun vendor/bearly/tools/refactor.ts batch-renames ($primary -> $fg-accent, $muted -> $fg-muted, etc.) — mostly mechanical with judgment for the handful that should map differently.

Acceptance: rg '\$(primary|secondary|accent|muted|link|error|warning|success|info|brand|inverse|surface|popover|selection|focusborder|cursor|border)\\b' apps/@km/tui/src vendor/silvery/packages/ag-react/src — 0 hits (or only documented exceptions). Then a follow-up silvery release can delete inlineSterlingTokens.


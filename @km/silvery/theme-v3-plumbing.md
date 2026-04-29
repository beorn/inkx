---
id: "@km/silvery/theme-v3-plumbing"
aliases:
  - km-silvery.theme-v3-plumbing
  - km-silvery-theme-v3-plumbing
created_by: Bjørn Stabell
created_at: 2026-04-19T04:06:02Z
closed_at: 2026-04-19T05:36:23Z
close_reason: "All 6 sub-beads closed. Theme v3 complete: R1 one-provider, R2
  AgNode cascade (global eliminated), R3 kebab-only state-variants, B2 WCAG
  build gate, N1-N4 cleanups, N6 theme inspect CLI. Silvery's theme system is
  now at the quality plateau — single provider, single canonical detectTheme,
  single derivation helper, tree-flow theme without globals, build-time contrast
  gate."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v3-plumbing
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-18T21:06:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Theme v3: Finish the plumbing (drop legacy provider, kill global, collapse token names) @km/silvery #task #P3

blocks:: [[@km/silvery]]

v2 shipped the user-facing theme API (tokens prop, variant=, state-variants, color=inherit). But the plumbing is still split. Quality plateau requires:

R1 — One ThemeProvider: delete @silvery/theme/ThemeContext legacy; ag-term/runtime/run.tsx and ag-term/xterm/index.ts currently import the LEGACY provider, so apps booted via run() don't get v2 tokens/variants unless they wrap manually. Wire v2 provider into both entry points.

R2 — Pipeline reads theme via AgNode cascade, not getActiveTheme() global: render-helpers.ts and adapters/terminal-adapter.ts currently use a module-level setActiveTheme/getActiveTheme pair because React context isn't reachable from the pipeline. We already ship color='inherit' which walks AgNode for colors; extend that cascade to Theme. Removes the global, enables SSR and multi-theme-in-one-tree.

R3 — One name per token: collapse PRIMER_ALIASES (40+ entries mapping kebab → camelCase) by making Theme a Record<kebab-string, string>. Every new token currently requires editing 3 places (union, alias, interface). Touches ~145 theme.X field accesses site-wide.

Related NARROW follow-ups (can be separate sub-beads):
- Delete 4 compat shim files in @silvery/theme (derive.ts, resolve.ts, color.ts, contrast.ts — 8 lines each)
- Delete deprecated brandRed/brandOrange/etc. aliases
- Merge two detectTheme functions (ansi lightweight + theme with Nord/Catppuccin fallback)
- 15-line @silvery/theme/types.ts stub — redundant with @silvery/ansi/theme/types.ts
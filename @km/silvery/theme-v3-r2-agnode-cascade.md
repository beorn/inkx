---
id: "@km/silvery/theme-v3-r2-agnode-cascade"
aliases:
  - km-silvery.theme-v3-r2-agnode-cascade
  - km-silvery-theme-v3-r2-agnode-cascade
created_by: Bjørn Stabell
created_at: 2026-04-19T04:09:19Z
closed_at: 2026-04-19T05:36:13Z
close_reason: Shipped at silvery 138c667a + km bump a2cccf66d. ThemeProvider now
  flows Theme via <Box theme={merged}> through the render pipeline's
  pushContextTheme/popContextTheme. Zero getActiveTheme/setActiveTheme
  references in packages/. Agent also fixed an adjacent cache-invalidation bug
  in prepared-text.ts where ANSI codes were baked into cached text — now cache
  keyed on context theme identity. 3 new theme-provider-cascade tests pass
  (nested isolation, incremental rerender, 3-level nesting).
---

# [x] R2: Pipeline reads theme via AgNode cascade, not getActiveTheme() global @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v3-plumbing]]

Kill setActiveTheme/getActiveTheme global. Pipeline reads Theme via the AgNode tree it's already rendering (same mechanism as color='inherit'). Enables SSR, multi-theme-in-one-tree. Surgery in render-helpers.ts, adapters/terminal-adapter.ts, ag-react/ui/canvas/index.ts. ~7 callsites + state.ts removal.
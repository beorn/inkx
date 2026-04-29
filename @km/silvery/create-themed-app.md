---
id: "@km/silvery/create-themed-app"
aliases:
  - km-silvery.create-themed-app
  - km-silvery-create-themed-app
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:11Z
closed_at: 2026-04-18T18:27:12Z
close_reason: "Shipped in v0.18.0: runThemed(<App />, { catalog, tokens }) in
  vendor/silvery/packages/ag-term/src/runtime/themed.tsx. Composes detectScheme
  + ThemeProvider + run. Exported from silvery/runtime barrel. Apps needing
  custom composition keep using createApp + pipe."
---

# [x] createThemedApp({ catalog }, <App />) one-line boot @km/silvery #task #P3

blocks:: [[@km/silvery/theme-system-v2]]

Single-call wrapper that composes the standard stack: detectScheme → ThemeProvider → terminal → react → focus → dom-events.\n\nAPI:\n  await createThemedApp({ catalog: allSchemes }, <App />).run()\n\nApps needing custom composition keep using createApp + pipe. This is the 'I just want to render a React TUI with a detected theme' shortcut.\n\nDepends on: tokens-prop-provider\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p9
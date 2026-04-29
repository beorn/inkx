---
id: "@km/silvery/package-layering"
aliases:
  - km-silvery.package-layering
  - km-silvery-package-layering
created_by: Bjørn Stabell
created_at: 2026-04-11T15:37:40Z
closed_at: 2026-04-11T15:57:30Z
close_reason: Done. Moved plugins + createApp from create to ag-term. create is
  now pure TS. Published silvery v0.16.0. 243 test files pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Package layering: make @silvery/create pure (no React, no ag-term) @km/silvery #task #P1 @Bjørn Stabell

Move terminal-specific and React-specific files out of @silvery/create so it becomes pure TS.

Target dependency chain (no cycles):
  ag → create → ag-react → ag-term

Moves:
  create → ag-term: create-app.tsx, with-terminal, with-focus, with-dom-events, with-diagnostics, with-render, with-links, plugins.ts
  create → ag-react: with-react

Stays in create: pipe, signal-store, tea, createSlice, streams, effects, text-cursor, internal/

Consumer impact: @km/tui imports from @silvery/create/plugins and @silvery/create/create-app — update ~10 files.

After: create has ZERO imports from react, ag-react, or ag-term.
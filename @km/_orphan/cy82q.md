---
id: "@km/_orphan/cy82q"
aliases:
  - km-cy82q
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:24Z
closed_at: 2026-03-23T22:37:24Z
close_reason: "Done: 3 public packages (silvery, @silvery/tea, @silvery/test).
  ag/ag-react/ag-term/theme marked private. Subpath re-exports: silvery/runtime,
  silvery/theme, silvery/ui"
---

# [x] Collapse public packages: silvery + @silvery/tea + @silvery/test @km/_orphan #task #P1 @claude:fed8de9e

Users shouldn't learn the package graph to build a counter. Public surface: silvery (components, hooks, render), @silvery/tea (optional app architecture), @silvery/test (optional testing). Internal: @silvery/core, @silvery/term, @silvery/react, @silvery/theme, @silvery/ui.
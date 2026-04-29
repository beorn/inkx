---
id: "@km/silvery/era2"
aliases:
  - km-silvery.era2
  - km-silvery-era2
created_by: claude:e4e70c9a
created_at: 2026-03-16T17:48:05Z
---

# [ ] Era2 alignment — dispatch/apply pipeline, plugin stores, signals substrate @km/silvery #epic #P1

blocks:: [[@km/silvery/tea]]

Era2 alignment — dispatch/apply pipeline, plugin composition.

CANONICAL DESIGN: vendor/silvery/docs/design/app-composition.md
V1r PROTOTYPE: vendor/internal/silvery/design/v15-tea/plugin-system-v1r.ts

Completed:
- Era2a (phases 1-6): TextFrame, term.paint, ag.layout/render, tree API, plugins, term unification
- Era2b (phases 0-6,8): tea(), headless, commands, scope, signals, model, ag types, withApp
- Package layering: create is pure (silvery v0.16.0)
- Virtual terminal: scrollback, search, select, ListView compositions

Remaining open children:
- @km/silvery/ag-test-coverage (P0) — pipeline test coverage
- @km/silvery/tea (P2 epic) — tea-useinput, tea-aichat, migration
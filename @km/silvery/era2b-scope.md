---
id: "@km/silvery/era2b-scope"
aliases:
  - km-silvery.era2b-scope
  - km-silvery-era2b-scope
created_by: claude:fed8de9e
created_at: 2026-03-25T04:35:54Z
closed_at: 2026-03-25T07:23:01Z
close_reason: "@silvery/scope package created: createScope (AbortSignal + defer
  + child + sleep + timeout), withScope plugin (adds root scope to app). 19
  tests passing. Zero dependencies."
---

# [x] Era2b Phase 2.5: @silvery/scope — extract withScope, createScope @km/silvery #task #P1 @claude:fed8de9e

Extract @silvery/scope from ag-term as standalone package.

- scope/src/ — NEW package: withScope(), createScope(), scope.child(), scope.defer()
- Cancellation semantics: signal propagation, error boundaries
- Op-scoped: lazy op.scope getter, auto-dispose after command completion
- Caller vs auto-created scope detection (value vs get descriptor)

Zero deps. Used by era2a withTerm (optional: term.events(app.scope?.signal)) and era2b withApp.
Design: era2b/app.md §Scopes
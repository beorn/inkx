---
id: "@km/silvery/scope-tree"
aliases:
  - km-silvery.scope-tree
  - km-silvery-scope-tree
created_by: claude:e4e70c9a
created_at: 2026-03-12T06:45:52Z
---

# [ ] Scope tree: generalize DisposableStack to structured concurrency primitive @km/silvery #feature #P4

blocks:: [[@km/silvery]]

Currently minimal.ts uses DisposableStack for cleanup only via app.defer(fn). A richer design unifies five concerns in one scope-tree structure:

- Lifecycle: mount/unmount → cleanup via DisposableStack
- Concurrency: fx.all for parallel effects, child scopes
- Cancellation: AbortSignal cascade parent→child
- Observability: every scope = loggily span with timing/tracing (via withTracing() plugin)
- Resource ownership: Disposable handles, auto-cleanup on scope dispose

Not a priority now — current design only needs DisposableStack for cleanup. Revisit when cancellation/concurrency/observability become concrete requirements.

References:
- hub/silvery/design/v15-tea/DESIGN.md (D1, D30 — current scope surface)
- hub/silvery/design/v15-tea/prototypes/minimal.ts (current app.defer pattern)
- Prior art: session fed8de9e (~29d ago) discussed the scope.defer() naming decision
- Related: legion integration for distributed scope trees
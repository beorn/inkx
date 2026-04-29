---
id: "@km/silvery/scope-phase-0"
aliases:
  - km-silvery.scope-phase-0
  - km-silvery-scope-phase-0
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:00Z
closed_at: 2026-04-24T21:43:30Z
close_reason: Phase 0 complete. Commit 3c785e87 on feat/scope-phase-0 branch in
  silvery repo. Scope rewritten as AsyncDisposableStack subclass per v4.1
  design. 23 unit tests green. Typecheck clean on scope files. Branch pushed.
  Ready to merge into silvery main when approved. Phase 1 blocks on merge +
  silvercode flurry settling.
started_at: 2026-04-24T21:34:45Z
owner: bjorn@stabell.org
assignee: claude:2aefb4b6
dependencies:
  - issue_id: km-silvery.scope-phase-0
    depends_on_id: km-silvery.lifecycle-scope
    type: parent-child
    created_at: 2026-04-24T13:39:17Z
    created_by: claude:2aefb4b6
    metadata: "{}"
---

# [x] Phase 0: Rewrite @silvery/scope as AsyncDisposableStack subclass (half day) @km/silvery #task #P1 @claude:2aefb4b6

blocks:: [[@km/silvery/lifecycle-scope]]

Replace the hand-rolled disposer stack in vendor/silvery/packages/scope/src/index.ts with a subclass of TC39 AsyncDisposableStack per hub/silvery/design/lifecycle-scope.md. Scope adds only: AbortSignal (with parent-signal linkage), child() method (tracking children in a private Set for early-release semantics), overridden [Symbol.asyncDispose] that cascades children first then delegates to super, overridden move() that throws. Export disposable() helper with sync + async overloads (attach both Symbol.dispose and Symbol.asyncDispose in impl). Export createScope, reportDisposeError, DisposeErrorContext. NO ScopeDisposedError (TC39's ReferenceError covers post-dispose ops). Delete sleep/timeout/interval methods on Scope. Require lib: [esnext.disposable] in tsconfig. Unit tests in vendor/silvery/packages/scope/tests/: parent-child signal propagation, child cascade via Set+override, early child dispose releases parent reference, disposable() sync+async overload behavior, move() throws. Don't re-test inherited TC39 behavior. Exit: bun run test:vendor -- scope passes.
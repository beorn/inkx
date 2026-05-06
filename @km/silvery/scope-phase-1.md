---
mentions:
  - km
  - claude
id: "@km/silvery/scope-phase-1"
aliases:
  - km-silvery.scope-phase-1
  - km-silvery-scope-phase-1
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:18Z
started_at: 2026-04-24T21:54:00Z
owner: bjorn@stabell.org
assignee: claude:2aefb4b6
dependencies:
  - issue_id: km-silvery.scope-phase-1
    depends_on_id: km-silvery.lifecycle-scope
    type: parent-child
    created_at: 2026-04-24T13:39:18Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-1
    depends_on_id: km-silvery.scope-phase-0
    type: blocks
    created_at: 2026-04-24T13:39:18Z
    created_by: claude:2aefb4b6
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.lifecycle-scope
      - type: link
        target: km-silvery.scope-phase-0
---

# [ ] Phase 1: Prototype de-risk (hooks + fiber disposal + withScope + silvercode migration) @km/silvery #task #P1 @claude:2aefb4b6

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-0]]

Build order (each step test-gated) per hub/silvery/design/lifecycle-scope.md Phase 1: (1) useScope/useAppScope/useScopeEffect hooks in vendor/silvery/packages/ag-react/src/hooks/; (2) fiber disposal in reconciler/host-config.ts routing failures to reportDisposeError(error, { phase: react-unmount, scope }); (3) withScope plugin wiring root SIGINT/SIGTERM through term.signals.on (which returns Disposable post-Phase 2); (4) migrate silvercode Claude subprocess via useScopeEffect + scope.use(disposable(child_process.spawn(...), p => p.kill('SIGTERM'))). No spawnClaude factory needed — use native child_process.spawn + disposable() wrapper. (5) dogfood for a week. 5 proof obligations before Phase 2: (a) useScopeEffect never runs during render, (b) StrictMode double-invoke disposes first scope before second mount, (c) post-dispose use/defer/adopt/child throw ReferenceError and [Symbol.asyncDispose]() is idempotent, (d) early child dispose releases from parent's Set, (e) every fire-and-forget dispose reports once through reportDisposeError. Bail if commit-phase reentrancy, StrictMode double-dispose, or sub-root lifetime fails.


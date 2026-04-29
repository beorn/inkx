---
id: "@km/silvery/scope-phase-5"
aliases:
  - km-silvery.scope-phase-5
  - km-silvery-scope-phase-5
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:50Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.scope-phase-5
    depends_on_id: km-silvery.lifecycle-scope
    type: parent-child
    created_at: 2026-04-24T13:40:50Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-5
    depends_on_id: km-silvery.scope-phase-4
    type: blocks
    created_at: 2026-04-24T13:40:51Z
    created_by: claude:2aefb4b6
    metadata: "{}"
---

# [ ] Phase 5: Deprecate + delete useDispose @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-4]]

(1) useDispose gets JSDoc @deprecated pointing to useScopeEffect/scope.defer/scope.use. (2) Body becomes a thin shim forwarding to useScopeEffect((scope) => scope.defer(fn), [fn]). (3) One release later: delete vendor/silvery/packages/ag-react/src/hooks/useDispose.ts. (4) Grep-gate against imports. Exit: useDispose.ts deleted; zero imports anywhere.
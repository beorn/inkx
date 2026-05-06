---
mentions:
  - km
id: "@km/silvery/scope-phase-3-useexit"
aliases:
  - km-silvery.scope-phase-3-useexit
  - km-silvery-scope-phase-3-useexit
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:55Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.scope-phase-3-useexit
    depends_on_id: km-silvery.lifecycle-scope
    type: parent-child
    created_at: 2026-04-24T13:39:55Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-3-useexit
    depends_on_id: km-silvery.scope-phase-2
    type: blocks
    created_at: 2026-04-24T13:39:56Z
    created_by: claude:2aefb4b6
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.lifecycle-scope
      - type: link
        target: km-silvery.scope-phase-2
---

# [ ] Phase 3.6: useExit migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Replace useExit() call sites with useAppScope() + root-scope disposal: const appScope = useAppScope(); function quit() { appScope[Symbol.asyncDispose]().catch(err => reportDisposeError(err, { phase: 'manual', scope: appScope })) }. Whole-app shutdown is a root-scope operation. Exit: grep for useExit in apps/* + packages/* returns zero.


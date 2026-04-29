---
id: "@km/silvery/scope-phase-4-migration-guide"
aliases:
  - km-silvery.scope-phase-4-migration-guide
  - km-silvery-scope-phase-4-migration-guide
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:48Z
closed_at: 2026-04-24T23:08:06Z
close_reason: "Shipped: vendor/silvery/docs/guide/scope.md @ silvery 98472d04,
  km b85436093. 747 lines: what is Scope, three patterns, 7 migration recipes
  (useDispose/SIGINT/term.signals/setTimeout/spawn/fs.watch/AbortController),
  withScope plugin, SILVERY_SCOPE_TRACE debugging, pitfalls, end-to-end example.
  grep clean (no vendor/ or hub/ paths)."
started_at: 2026-04-24T22:43:44Z
owner: bjorn@stabell.org
assignee: claude:2aefb4b6
dependencies:
  - issue_id: km-silvery.scope-phase-4-migration-guide
    depends_on_id: km-silvery.scope-phase-4
    type: parent-child
    created_at: 2026-04-24T13:40:48Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-4-migration-guide
    depends_on_id: km-silvery.scope-phase-4-eslint
    type: blocks
    created_at: 2026-04-24T13:40:48Z
    created_by: claude:2aefb4b6
    metadata: "{}"
---

# [x] Phase 4.F: Migration guide (new doc) @km/silvery #task #P2 @claude:2aefb4b6

blocks:: [[@km/silvery/scope-phase-4]], [[@km/silvery/scope-phase-4-eslint]]

Write hub/silvery/design/migration-lifecycle-scope.md — single-page cheat sheet of the 10 before/after migrations from lifecycle-scope.md. Linkable from root CLAUDE.md + silvery release notes. Exit: doc committed, links in place.
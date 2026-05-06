---
mentions:
  - km
  - km
  - Bjørn
id: "@km/all/reactive-tree-extract"
aliases:
  - km-all.reactive-tree-extract
  - km-all-reactive-tree-extract
created_by: Bjørn Stabell
created_at: 2026-04-19T04:05:11Z
closed_at: 2026-04-19T04:12:58Z
close_reason: Extracted to packages/reactive-tree/. 33/33 tests pass in new
  location. km-tui consumer migrated. Commit c71915597. Vendor submodule
  promotion deferred until a second consumer materializes.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-all.reactive-tree-extract
    depends_on_id: km-all.reactive-tree-library
    type: parent-child
    created_at: 2026-04-18T21:05:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/storage/reactive-tree-library"
---

# [x] Extract reactive-graph.ts to @km/reactive-tree workspace package @km/all #task #P2 @Bjørn Stabell

blocks:: [[@km/storage/reactive-tree-library]]

Phase 2 of @km/all/reactive-tree-library.

Extract apps/@km/tui/src/state/reactive-graph.ts to packages/reactive-tree/ as a workspace package. Keep API-compatible; move tests + bench. Update the sole consumer (apps/@km/tui/src/state/reactive.ts).

Defer vendor/ submodule promotion until a second consumer exists — workspace package is reversible and avoids premature github-repo/npm-scope commitment. Same in-tree move as the silvery-internal → hub/silvery/ pattern applied in reverse.

Scope:

- Create packages/reactive-tree/ (package.json, tsconfig.json, CLAUDE.md, README.md)
- Move reactive-graph.ts → packages/reactive-tree/src/index.ts (rename export surface)
- Move tests (reactive-graph.test.ts) → packages/reactive-tree/tests/
- Move bench (reactive-graph-perf.bench.ts) → packages/reactive-tree/tests/
- Update apps/@km/tui: add @km/reactive-tree dep, replace local import
- Delete apps/@km/tui/src/state/reactive-graph.ts + tests
- bun fix + bun run test:fast green

Out of scope (future beads):

- Phase 3: first-class topology events
- Phase 4: strategy adapters
- Promotion to vendor/ submodule + npm publish


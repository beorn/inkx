---
id: "@km/storage/lazy-hydration-linkchanges-emit"
aliases:
  - km-storage.lazy-hydration-linkchanges-emit
  - km-storage-lazy-hydration-linkchanges-emit
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:35:53Z
closed_at: 2026-04-22T17:34:02Z
close_reason: Shipped commit d59dd9c68. ReconcileContext now carries optional
  linkChanges; create-handler/update-handler/delete-handler populate hostIds +
  targetHrefs on every add/remove. applier.ts returns ApplyResult
  (hostIds+targetHrefs). FsStore.handleFsSync aggregates across dirs, stamps
  delta.linkChanges on CommitResult. backlinksState signals now fire on
  FS-driven link changes. 4 end-to-end tests in backlinks-fs-reconcile.test.ts
  pass. 7185 fast-suite tests.
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.lazy-hydration-linkchanges-emit
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T08:35:53Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Wire linkChanges delta emission from FS reconcile path @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage]]

The lazy-hydration bead (closed 2026-04-22) shipped the RepoDelta.linkChanges field + backlinksState reactive signal + notifyLinkChange imperative entry, but **the FS reconcile path does not yet emit linkChanges in its commit delta**. Consequence: backlinks views stay stale after an external FS edit until something else triggers a refresh.

The agent's own scope note flagged this: 'Did not plumb linkChanges emission through FS reconciliation — that's a larger refactor in watch/. The extension point (notifyLinkChange + optional delta.linkChanges) is in place for a follow-up bead.'

## Scope

- Identify link-table INSERT/DELETE sites in the FS reconcile path (packages/@km/_orphan/fs-mount/src/watch/*, packages/@km/storage/src/markdown/link-resolution.ts, etc.)
- Collect hostIds + targetHrefs into the commit delta for each reconcile pass
- Commit delta consumers (withReactive) already route these through backlinksState

## /complete
- External edit to file containing [[Target]] → backlinks view for Target updates without manual refresh
- Test: packages/@km/storage/tests/store/backlinks-fs-reconcile.test.ts asserts end-to-end
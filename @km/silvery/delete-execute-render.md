---
id: "@km/silvery/delete-execute-render"
aliases:
  - km-silvery.delete-execute-render
  - km-silvery-delete-execute-render
created_by: Bjørn Stabell
created_at: 2026-04-12T07:39:12Z
closed_at: 2026-04-12T08:39:03Z
close_reason: Deleted executeRender. 6 callers migrated to createAg directly.
  -215 net lines from pipeline/index.ts. Docs updated. Commit 4ec07b50.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.delete-execute-render
    depends_on_id: km-silvery.layout-quality-plateau
    type: parent-child
    created_at: 2026-04-12T00:46:41Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-silvery.delete-execute-render
    depends_on_id: km-silvery.test-runtime-parity
    type: blocks
    created_at: 2026-04-12T00:46:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Delete executeRender — legacy shim wrapping createAg @km/silvery #task #P1

blocks:: [[@km/silvery/layout-quality-plateau]], [[@km/silvery/test-runtime-parity]]

executeRender() in pipeline/index.ts is a legacy wrapper that creates a createAg instance, calls ag.layout() + ag.render(), and adds buffer management. Having both executeRender and createAg as public APIs creates confusion — no clear guidance on when to use which, and divergent code paths that hide bugs (the fit-content dirty-flag bug survived testing because createAg and executeRender had different pipeline behavior before unification).

Callers to migrate:
1. renderer.ts (3 call sites) — legacy render() API used by Ink compat layer and 1 test
2. scheduler.ts (4 call sites) — old RenderScheduler, used by ag-react render.tsx (legacy React render mode)

Both should migrate to createAg directly. After migration, delete executeRender entirely.

Justification: "having multiple ways to do things with no clear reasoning for when to use what is just asking for problems" — user feedback from the fit-content session.

Depends on: nothing. Blocked by: nothing. Nice companion to @km/silvery/test-runtime-parity (delete layoutDirty).
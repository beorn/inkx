---
aliases:
  - km-test-infra.deterministic-ulid-factory.km-fs-mount-migration
  - km-test-infra-deterministic-ulid-factory-km-fs-mount-migration
created_at: 2026-05-09T01:01:00.000Z
---

# Migrate km-fs-mount call sites to the IdFactory seam #chore #P2

Parent: `@km/test-infra/deterministic-ulid-factory` (closed in 23a3db6cd) introduced the `IdFactory` injection seam in `@km/storage`. This sub-bead migrates `@km/fs-mount`'s direct `ulid()` calls to use `getIdFactory()` so that reconciler-driven IDs become deterministic when tests pin the factory.

Call sites to migrate (per the parent bead's grep):

- `packages/km-fs-mount/src/watch/change-handlers.ts:12` (import) + `:960` (`id: ulid()`)
- `packages/km-fs-mount/src/watch/applier.ts:10` (import) + `:272` (`parseJobs.push({ op, nodeId: ulid(), isCreate: true })`)
- `packages/km-fs-mount/src/watch/handlers/create-handler.ts:11` (import) + `:152` (`id: ulid()`) + `:357` (`return ulid()`)
- `packages/km-fs-mount/src/store/fs.ts:42` (import) + `:216` (`meta: { commitId: ulid(), source: "fs-import" }`) + `:265` (`const commitId = meta?.commitId ?? ulid()`)

Acceptance:
- Every direct `ulid()` call site in `packages/km-fs-mount/src/` is replaced with `getIdFactory()()` (importing `getIdFactory` from `@km/storage`).
- `packages/km-fs-mount/src/` no longer imports `ulid` from `"ulid"` for production code (test helpers may still use it directly).
- `bun vitest run packages/km-fs-mount/tests/` passes; `tsc --noEmit` 0 errors beyond baseline.
- After this lands, `@km/storage/sync-architecture/chaos-matrix-reconciler-stale-state-on-rewrite` (P1 #bug) is unblocked — its regression tests can pin a deterministic factory across the reconciler boundary.

Out of scope: `@km/beads` migration (filed separately), `@km/storage` testing helpers (intentional — fixtures bypass the seam by design), federation/repo-id (different ID class).
